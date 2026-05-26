import type { ApiSettings } from "./types";

/**
 * 统一的 chat-completion + 工具调用客户端。两种 Wire 格式：
 *  - OpenAI 兼容（QinyAPI / Gemini-OAI / DeepSeek / Ollama / 自定义）
 *  - Anthropic 原生 /v1/messages（含 cache_control 优化）
 *
 * 顶层 fetchChatCompletion(messages, settings, onChunk, signal, toolUseOptions)
 * 根据 settings.apiFormat 分发，对调用方完全屏蔽两套协议差异。
 *
 * 工具调用循环：每 round 一次 LLM 调用 + 一批工具执行；通过 maxRounds 硬封顶
 * 防止失控。多 round 之间消息列表逐步追加：
 *   [history, assistant(tool_calls), tool(result), assistant(tool_calls), ...]
 *
 * 流式 token 用量、prompt 缓存命中数（OpenAI prompt_tokens_details / Anthropic
 * cache_*_input_tokens）会在 ApiUsage 里上报，便于前端展示成本。
 */

export interface ApiUsage {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
  prompt_tokens_details?: {
    cached_tokens?: number;
    [k: string]: unknown;
  };
  cache_read_input_tokens?: number;
  cache_creation_input_tokens?: number;
}

export type ApiMessage = {
  role: string;
  content: string | unknown[];
  tool_call_id?: string;
  tool_calls?: unknown[];
};

export interface LlmTool {
  name: string;
  description: string;
  inputSchema?: unknown;
}

export type ToolExecutionResult =
  | { ok: true; text: string }
  | { ok: false; message: string };

export type ToolExecutor = (
  name: string,
  args: Record<string, unknown>,
) => Promise<ToolExecutionResult>;

export interface ToolEvent {
  round: number;
  name: string;
  args: Record<string, unknown>;
  result: ToolExecutionResult;
}

export interface ToolUseOptions {
  tools: LlmTool[];
  executeTool: ToolExecutor;
  onToolEvent?: (event: ToolEvent) => void;
  /** 工具循环最大轮数。默认 5。每轮 = 一次 LLM 调用 + 该轮 tool_call 全部执行。 */
  maxRounds?: number;
}

export class ApiHttpError extends Error {
  status: number;
  body: string;
  constructor(status: number, body: string) {
    super(`API ${status}: ${(body || "").slice(0, 300)}`);
    this.name = "ApiHttpError";
    this.status = status;
    this.body = body;
  }
}

/**
 * 带连接超时的 fetch。看门狗仅在 response headers 到来前生效；body 流式读取
 * 阶段不会被超时打断。用户的取消信号（Stop 按钮）也会接入同一个 controller。
 */
const REQUEST_TIMEOUT_MS = 60_000;
async function fetchWithTimeout(
  input: RequestInfo,
  init: RequestInit,
  userSignal: AbortSignal | undefined,
  timeoutMs: number = REQUEST_TIMEOUT_MS,
): Promise<Response> {
  const ctrl = new AbortController();
  let timedOut = false;
  const linkUserAbort = () => ctrl.abort();
  if (userSignal) {
    if (userSignal.aborted) ctrl.abort();
    else userSignal.addEventListener("abort", linkUserAbort, { once: true });
  }
  const timer = setTimeout(() => {
    timedOut = true;
    ctrl.abort();
  }, timeoutMs);
  try {
    return await fetch(input, { ...init, signal: ctrl.signal });
  } catch (err: unknown) {
    if ((err as { name?: string })?.name === "AbortError" && timedOut) {
      throw new Error(`请求超时:${Math.round(timeoutMs / 1000)} 秒内未收到响应`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
    if (userSignal) userSignal.removeEventListener("abort", linkUserAbort);
  }
}
/**
 * 规范化用户提供的 baseUrl：
 *   - 去掉首尾空白与末尾斜杠
 *   - 削掉常见末段 endpoint，让用户随意贴 v1 / 完整 URL
 *   - 没有路径时补默认的 /v1（绝大多数 OpenAI 兼容服务都用这个前缀）
 *
 * 例：
 *   https://openai.chatnewai.com         → https://openai.chatnewai.com/v1
 *   https://api.openai.com/v1/chat/completions → https://api.openai.com/v1
 *   https://generativelanguage.googleapis.com/v1beta/openai → 原样返回
 */
export function normalizeBaseUrl(raw: string): string {
  let url = (raw || "").trim().replace(/\/+$/, "");
  if (!url) return "";
  const knownSuffixes = [
    "/chat/completions",
    "/v1/chat/completions",
    "/messages",
    "/v1/messages",
    "/models",
    "/v1/models",
  ];
  for (const suffix of knownSuffixes) {
    if (url.toLowerCase().endsWith(suffix)) {
      url = url.slice(0, -suffix.length);
      break;
    }
  }
  url = url.replace(/\/+$/, "");
  try {
    const u = new URL(url);
    if (u.pathname === "" || u.pathname === "/") {
      url = `${u.origin}/v1`;
    }
  } catch {
    // 留给 assertSafeBaseUrl 抛精确错误
  }
  return url;
}

/**
 * 拒绝非 https / 非 loopback http 的协议。防止配置错误把 Authorization
 * 头发到攻击者控制的 http endpoint，也防止 fetch 触发 file: / data: 等
 * 非法协议。
 */
function assertSafeBaseUrl(baseUrl: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(baseUrl);
  } catch {
    throw new Error(`无效的 API Base URL: ${baseUrl}`);
  }
  const host = parsed.hostname.toLowerCase();
  const isLoopback =
    host === "localhost" ||
    host === "127.0.0.1" ||
    host === "[::1]" ||
    host === "::1";
  if (parsed.protocol === "https:") return parsed;
  if (parsed.protocol === "http:" && isLoopback) return parsed;
  throw new Error(
    `不允许的 API 协议: ${parsed.protocol}。仅支持 https://，本地调试可使用 http://localhost`,
  );
}

function isOfficialAnthropicHost(baseUrl: string): boolean {
  try {
    const host = new URL(baseUrl).hostname.toLowerCase();
    return host === "api.anthropic.com" || host.endsWith(".anthropic.com");
  } catch {
    return false;
  }
}
export async function fetchChatCompletion(
  messages: ApiMessage[],
  settings: ApiSettings,
  onChunk: (chunk: string) => void,
  signal?: AbortSignal,
  toolUseOptions?: ToolUseOptions,
): Promise<ApiUsage | void> {
  const format = settings.apiFormat || "openai";
  if (format === "anthropic") {
    return fetchAnthropic(messages, settings, onChunk, signal, toolUseOptions);
  }
  return fetchOpenAI(messages, settings, onChunk, signal, toolUseOptions);
}

function toolsToOpenAI(tools: LlmTool[]): unknown[] {
  return tools.map((t) => ({
    type: "function",
    function: {
      name: t.name,
      description: t.description,
      parameters: t.inputSchema || { type: "object", properties: {} },
    },
  }));
}

function addOptional(a: number | undefined, b: number | undefined): number | undefined {
  if (a == null && b == null) return undefined;
  return (a || 0) + (b || 0);
}

function mergeUsage(acc: ApiUsage | undefined, next: ApiUsage | undefined): ApiUsage | undefined {
  if (!next) return acc;
  if (!acc) return next;
  return {
    prompt_tokens: addOptional(acc.prompt_tokens, next.prompt_tokens),
    completion_tokens: addOptional(acc.completion_tokens, next.completion_tokens),
    total_tokens: addOptional(acc.total_tokens, next.total_tokens),
    prompt_tokens_details: next.prompt_tokens_details ?? acc.prompt_tokens_details,
    cache_read_input_tokens: addOptional(
      acc.cache_read_input_tokens,
      next.cache_read_input_tokens,
    ),
    cache_creation_input_tokens: addOptional(
      acc.cache_creation_input_tokens,
      next.cache_creation_input_tokens,
    ),
  };
}

interface OpenAITurnResult {
  usage?: ApiUsage;
  assistantText: string;
  toolCalls: OpenAIToolCall[];
  finishReason: string | null;
}

interface OpenAIToolCall {
  id?: string;
  type?: string;
  function: { name?: string; arguments: string };
}
/**
 * 单次 OpenAI 完成调用。返回 token 用量、可见文本、tool_calls 与 finish_reason，
 * 由调用者决定是否继续工具循环。`onChunk` 仅在可见文本到达时触发，
 * tool_call argument 流式碎片静默累积，不喂给 UI。
 */
async function callOpenAIOnce(
  messages: ApiMessage[],
  settings: ApiSettings,
  onChunk: (chunk: string) => void,
  signal: AbortSignal | undefined,
  tools: LlmTool[] | undefined,
): Promise<OpenAITurnResult> {
  const { apiKey, model, isStreaming } = settings;
  const baseUrl = normalizeBaseUrl(settings.baseUrl);
  assertSafeBaseUrl(baseUrl);
  const url = `${baseUrl}/chat/completions`;

  const requestBody: Record<string, unknown> = {
    model,
    messages,
    stream: !!isStreaming,
  };
  if (isStreaming) {
    requestBody.stream_options = { include_usage: true };
  }
  if (tools && tools.length > 0) {
    requestBody.tools = toolsToOpenAI(tools);
  }

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (apiKey) {
    headers["Authorization"] = `Bearer ${apiKey}`;
  }

  const response = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(requestBody),
    referrerPolicy: "no-referrer",
    signal,
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => "");
    throw new ApiHttpError(response.status, errText);
  }

  if (!isStreaming) {
    const data = await response.json();
    const choice = data.choices?.[0];
    const msg = choice?.message;
    const text = (msg?.content as string) || "";
    if (text) onChunk(text);
    return {
      usage: data.usage as ApiUsage,
      assistantText: text,
      toolCalls: Array.isArray(msg?.tool_calls) ? msg.tool_calls : [],
      finishReason: choice?.finish_reason || null,
    };
  }

  if (!response.body) {
    throw new Error("Response body is null");
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder("utf-8");
  let buffer = "";
  let finalUsage: ApiUsage | undefined;
  let assistantText = "";
  let finishReason: string | null = null;

  // OpenAI 把 tool_calls 切成多个 delta 推送，每片带 index 表明属于哪一项；
  // 同一个 tool_call 的 arguments 会被切成字符串碎片，到 finish_reason 时
  // 才能整体 JSON.parse —— 所以这里按 index 累积，最后再 materialize。
  const toolCallAcc: Record<number, OpenAIToolCall> = {};

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";

    for (const line of lines) {
      if (line.trim() === "") continue;
      if (!line.startsWith("data: ")) continue;
      const dataStr = line.slice(6).trim();
      if (!dataStr || dataStr === "[DONE]") continue;

      try {
        const data = JSON.parse(dataStr);
        const choice = data.choices?.[0];
        const delta = choice?.delta;
        if (delta?.content) {
          assistantText += delta.content;
          onChunk(delta.content);
        }
        if (Array.isArray(delta?.tool_calls)) {
          for (const tcDelta of delta.tool_calls) {
            const idx = tcDelta.index ?? 0;
            const slot = toolCallAcc[idx] || (toolCallAcc[idx] = {
              function: { name: "", arguments: "" },
            });
            if (tcDelta.id) slot.id = tcDelta.id;
            if (tcDelta.type) slot.type = tcDelta.type;
            if (tcDelta.function?.name) {
              slot.function.name = (slot.function.name || "") + tcDelta.function.name;
            }
            if (tcDelta.function?.arguments) {
              slot.function.arguments += tcDelta.function.arguments;
            }
          }
        }
        if (choice?.finish_reason) {
          finishReason = choice.finish_reason;
        }
        if (data.usage) {
          finalUsage = data.usage;
        }
      } catch {
        console.warn("Failed to parse chunk:", dataStr);
      }
    }
  }

  const toolCalls = Object.keys(toolCallAcc)
    .map((k) => Number(k))
    .sort((a, b) => a - b)
    .map((idx) => toolCallAcc[idx])
    .filter((tc): tc is OpenAIToolCall => !!tc && !!tc.id);

  return { usage: finalUsage, assistantText, toolCalls, finishReason };
}
async function fetchOpenAI(
  messages: ApiMessage[],
  settings: ApiSettings,
  onChunk: (chunk: string) => void,
  signal?: AbortSignal,
  toolUseOptions?: ToolUseOptions,
): Promise<ApiUsage | void> {
  const tools = toolUseOptions?.tools;
  const executeTool = toolUseOptions?.executeTool;
  const maxRounds = toolUseOptions?.maxRounds ?? 5;

  let currentMessages = messages;
  let usage: ApiUsage | undefined;

  // 硬封顶 maxRounds + 1：每"轮"是一次 LLM 调用，可能以 tool_calls 收尾；
  // 多出来的一轮让模型在最后一批工具结果回来后产出无工具的最终回答。
  for (let round = 0; round <= maxRounds; round++) {
    const turn = await callOpenAIOnce(
      currentMessages,
      settings,
      onChunk,
      signal,
      tools,
    );
    usage = mergeUsage(usage, turn.usage);

    if (turn.toolCalls.length === 0 || !executeTool) {
      return usage;
    }
    if (round === maxRounds) {
      // 工具预算耗尽，注入合成的"预算用尽"结果 + 撤掉工具列表，
      // 强迫模型用文字收尾。
      currentMessages = [
        ...currentMessages,
        { role: "assistant", content: turn.assistantText, tool_calls: turn.toolCalls },
      ];
      for (const tc of turn.toolCalls) {
        currentMessages = [
          ...currentMessages,
          {
            role: "tool",
            tool_call_id: tc.id,
            content: "[tool_error] tool-call rounds exhausted; respond with what you know",
          },
        ];
      }
      const finalTurn = await callOpenAIOnce(
        currentMessages,
        settings,
        onChunk,
        signal,
        undefined,
      );
      return mergeUsage(usage, finalTurn.usage);
    }

    currentMessages = [
      ...currentMessages,
      {
        role: "assistant",
        content: turn.assistantText,
        tool_calls: turn.toolCalls,
      },
    ];

    for (const tc of turn.toolCalls) {
      let parsedArgs: Record<string, unknown> = {};
      try {
        parsedArgs = tc.function.arguments
          ? JSON.parse(tc.function.arguments)
          : {};
      } catch {
        parsedArgs = {};
      }
      const result = await executeTool(tc.function.name || "", parsedArgs);
      toolUseOptions?.onToolEvent?.({
        round,
        name: tc.function.name || "",
        args: parsedArgs,
        result,
      });
      const resultText: string = result.ok
        ? result.text
        : `[tool_error] ${result.message}`;
      currentMessages = [
        ...currentMessages,
        {
          role: "tool",
          tool_call_id: tc.id,
          content: resultText,
        },
      ];
    }
  }

  return usage;
}
/**
 * OpenAI 风格 content（string 或 parts 数组）→ Anthropic 风格 content。
 *  - string 透传
 *  - { type: 'text', text } 透传
 *  - { type: 'image_url' } → { type: 'image', source: ... }
 */
type ContentPart = { type: string; text?: string; [k: string]: unknown };

function convertContentToAnthropic(content: string | unknown[]): string | unknown[] {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return String(content ?? "");

  return content.map((raw) => {
    if (!raw || typeof raw !== "object") return { type: "text", text: String(raw ?? "") };
    const part = raw as ContentPart & { image_url?: { url?: string } };
    if (part.type === "text") return { type: "text", text: part.text ?? "" };
    if (part.type === "image_url") {
      const url: string = part.image_url?.url ?? "";
      const dataUrlMatch = /^data:([^;]+);base64,(.+)$/.exec(url);
      if (dataUrlMatch) {
        return {
          type: "image",
          source: {
            type: "base64",
            media_type: dataUrlMatch[1],
            data: dataUrlMatch[2],
          },
        };
      }
      return { type: "image", source: { type: "url", url } };
    }
    return part;
  });
}

function contentToTextParts(content: string | unknown[]): ContentPart[] {
  if (typeof content === "string") return [{ type: "text", text: content }];
  return Array.isArray(content)
    ? (content as ContentPart[])
    : [{ type: "text", text: String(content ?? "") }];
}
/**
 * 把 OpenAI 风格的 messages 拆成 Anthropic 的 system + 交替 messages。
 *  - 最后一个 user 之前的 system 消息合并进顶层 `system` 字段（常规做法）
 *  - 最后一个 user 之后的 system 消息会被内联进该 user 内容尾部，保留
 *    SillyTavern Depth=0 注入语义（搜索 / MCP / worldinfo 等）
 *  - 同 role 连续消息合并
 */
function prepareAnthropicPayload(messages: ApiMessage[]): {
  system: string;
  messages: { role: "user" | "assistant"; content: ContentPart[] }[];
} {
  let lastUserIdx = -1;
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m && m.role === "user") {
      lastUserIdx = i;
      break;
    }
  }

  const systemTexts: string[] = [];
  const tailSystemTexts: string[] = [];
  const converted: { role: "user" | "assistant"; content: ContentPart[] }[] = [];

  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];
    if (!msg) continue;

    if (msg.role === "system") {
      const text = typeof msg.content === "string"
        ? msg.content
        : contentToTextParts(msg.content)
            .filter((p) => p?.type === "text")
            .map((p) => p.text || "")
            .join("\n");
      if (!text) continue;
      if (lastUserIdx !== -1 && i > lastUserIdx) {
        tailSystemTexts.push(text);
      } else {
        systemTexts.push(text);
      }
      continue;
    }

    const role: "user" | "assistant" = msg.role === "assistant" ? "assistant" : "user";
    const parts = convertContentToAnthropic(msg.content);
    const partsArr: ContentPart[] = Array.isArray(parts)
      ? (parts as ContentPart[])
      : [{ type: "text", text: parts as string }];

    const last = converted[converted.length - 1];
    if (last && last.role === role) {
      last.content.push(...partsArr);
    } else {
      converted.push({ role, content: partsArr });
    }
  }

  if (tailSystemTexts.length > 0) {
    let target: { role: "user" | "assistant"; content: ContentPart[] } | undefined;
    for (let i = converted.length - 1; i >= 0; i--) {
      const candidate = converted[i];
      if (candidate && candidate.role === "user") {
        target = candidate;
        break;
      }
    }
    if (target) {
      const inlined = "\n\n" + tailSystemTexts.join("\n\n");
      const lastPartIdx = target.content.length - 1;
      const lastPart = target.content[lastPartIdx];
      if (lastPart && lastPart.type === "text") {
        target.content[lastPartIdx] = {
          ...lastPart,
          text: (lastPart.text || "") + inlined,
        };
      } else {
        target.content.push({ type: "text", text: inlined });
      }
    } else {
      systemTexts.push(...tailSystemTexts);
    }
  }

  return {
    system: systemTexts.join("\n\n"),
    messages: converted,
  };
}
function toolsToAnthropic(tools: LlmTool[]): unknown[] {
  return tools.map((t) => ({
    name: t.name,
    description: t.description,
    input_schema: t.inputSchema || { type: "object", properties: {} },
  }));
}

function anthropicUsageToApi(
  inputTokens: number | undefined,
  outputTokens: number | undefined,
  cacheReadTokens: number | undefined,
  cacheCreationTokens: number | undefined,
): ApiUsage {
  return {
    prompt_tokens: inputTokens,
    completion_tokens: outputTokens,
    total_tokens:
      inputTokens != null && outputTokens != null
        ? inputTokens + outputTokens
        : undefined,
    cache_read_input_tokens: cacheReadTokens,
    cache_creation_input_tokens: cacheCreationTokens,
  };
}

interface AnthropicTurnResult {
  usage?: ApiUsage;
  /** 完整 content 块（text + tool_use）按模型产出的顺序返回。
   *  追加工具结果时必须把这些块原样回传给 Anthropic。 */
  assistantBlocks: ContentPart[];
  stopReason: string | null;
}

async function callAnthropicOnce(
  anthMessages: { role: "user" | "assistant"; content: ContentPart[] }[],
  system: string,
  settings: ApiSettings,
  onChunk: (chunk: string) => void,
  signal: AbortSignal | undefined,
  tools: LlmTool[] | undefined,
): Promise<AnthropicTurnResult> {
  const { apiKey, model, isStreaming } = settings;
  const baseUrl = normalizeBaseUrl(settings.baseUrl);
  assertSafeBaseUrl(baseUrl);
  const url = `${baseUrl}/messages`;

  // Prompt 缓存只在官方 Anthropic 主机启用 —— 第三方网关对 cache_control
  // 字段表现不一致，宽松的会透传，严格的会直接拒绝请求。
  const useCacheControl = isOfficialAnthropicHost(baseUrl);

  const requestBody: Record<string, unknown> = {
    model,
    max_tokens: 4096,
    messages: anthMessages,
    stream: !!isStreaming,
  };
  if (system) {
    requestBody.system = useCacheControl
      ? [{ type: "text", text: system, cache_control: { type: "ephemeral" } }]
      : system;
  }
  if (tools && tools.length > 0) {
    requestBody.tools = toolsToAnthropic(tools);
  }

  // 第二个缓存断点：倒数第二条消息的最后一个 part —— 缓存住整段历史前缀，
  // 只有最新一轮 user 全价计费。
  if (useCacheControl && anthMessages.length >= 2) {
    const target = anthMessages[anthMessages.length - 2];
    if (target && target.content.length > 0) {
      const lastIdx = target.content.length - 1;
      const lastPart = target.content[lastIdx];
      if (lastPart && typeof lastPart === "object") {
        target.content[lastIdx] = {
          ...lastPart,
          cache_control: { type: "ephemeral" },
        };
      }
    }
  }
  // 同时挂两套鉴权头：x-api-key（Anthropic 官方）+ Authorization Bearer（多数代理）。
  // dangerous-direct-browser-access 仅对官方主机加，避免触怒严格代理。
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "anthropic-version": "2023-06-01",
  };
  if (apiKey) {
    headers["Authorization"] = `Bearer ${apiKey}`;
    headers["x-api-key"] = apiKey;
  }
  if (isOfficialAnthropicHost(baseUrl)) {
    headers["anthropic-dangerous-direct-browser-access"] = "true";
  }

  const response = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(requestBody),
    referrerPolicy: "no-referrer",
    signal,
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => "");
    throw new ApiHttpError(response.status, errText);
  }

  if (!isStreaming) {
    const data = await response.json();
    const blocks: ContentPart[] = Array.isArray(data.content) ? data.content : [];
    for (const b of blocks) {
      if (b?.type === "text" && typeof b.text === "string" && b.text) {
        onChunk(b.text);
      }
    }
    const usage = data.usage || {};
    return {
      usage: anthropicUsageToApi(
        usage.input_tokens,
        usage.output_tokens,
        usage.cache_read_input_tokens,
        usage.cache_creation_input_tokens,
      ),
      assistantBlocks: blocks,
      stopReason: data.stop_reason || null,
    };
  }

  if (!response.body) {
    throw new Error("Response body is null");
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder("utf-8");
  let buffer = "";
  let inputTokens: number | undefined;
  let outputTokens: number | undefined;
  let cacheReadTokens: number | undefined;
  let cacheCreationTokens: number | undefined;
  let stopReason: string | null = null;

  // Anthropic 流式按 content_block_index 切分，每块要么是 text 要么是 tool_use；
  // tool_use 的 input 通过 input_json_delta.partial_json 字符串碎片到达。
  type Slot =
    | { kind: "text"; text: string }
    | { kind: "tool_use"; id: string; name: string; jsonAcc: string };
  const slots: Record<number, Slot> = {};

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || !trimmed.startsWith("data:")) continue;
      const dataStr = trimmed.slice(5).trim();
      if (!dataStr || dataStr === "[DONE]") continue;

      try {
        const event = JSON.parse(dataStr);
        switch (event.type) {
          case "message_start": {
            const u = event.message?.usage;
            if (u?.input_tokens != null) inputTokens = u.input_tokens;
            if (u?.output_tokens != null) outputTokens = u.output_tokens;
            if (u?.cache_read_input_tokens != null) cacheReadTokens = u.cache_read_input_tokens;
            if (u?.cache_creation_input_tokens != null) cacheCreationTokens = u.cache_creation_input_tokens;
            break;
          }
          case "content_block_start": {
            const block = event.content_block;
            if (block?.type === "text") {
              slots[event.index] = { kind: "text", text: "" };
            } else if (block?.type === "tool_use") {
              slots[event.index] = {
                kind: "tool_use",
                id: block.id,
                name: block.name,
                jsonAcc: "",
              };
            }
            break;
          }
          case "content_block_delta": {
            const slot = slots[event.index];
            const delta = event.delta;
            if (!slot || !delta) break;
            if (slot.kind === "text" && delta.type === "text_delta" && typeof delta.text === "string") {
              slot.text += delta.text;
              onChunk(delta.text);
            } else if (slot.kind === "tool_use" && delta.type === "input_json_delta" && typeof delta.partial_json === "string") {
              slot.jsonAcc += delta.partial_json;
            }
            break;
          }
          case "message_delta": {
            if (event.delta?.stop_reason) stopReason = event.delta.stop_reason;
            if (event.usage?.output_tokens != null) outputTokens = event.usage.output_tokens;
            if (event.usage?.cache_read_input_tokens != null) cacheReadTokens = event.usage.cache_read_input_tokens;
            if (event.usage?.cache_creation_input_tokens != null) cacheCreationTokens = event.usage.cache_creation_input_tokens;
            break;
          }
          case "message_stop":
          default:
            break;
        }
      } catch {
        console.warn("Failed to parse Anthropic chunk:", dataStr);
      }
    }
  }
  const assistantBlocks: ContentPart[] = Object.keys(slots)
    .map((k) => Number(k))
    .sort((a, b) => a - b)
    .map((idx): ContentPart | null => {
      const s = slots[idx];
      if (!s) return null;
      if (s.kind === "text") {
        return { type: "text", text: s.text };
      }
      let input: Record<string, unknown> = {};
      try {
        input = s.jsonAcc ? JSON.parse(s.jsonAcc) : {};
      } catch {
        input = {};
      }
      return { type: "tool_use", id: s.id, name: s.name, input };
    })
    .filter((b): b is ContentPart => b !== null);

  return {
    usage: anthropicUsageToApi(inputTokens, outputTokens, cacheReadTokens, cacheCreationTokens),
    assistantBlocks,
    stopReason,
  };
}

async function fetchAnthropic(
  messages: ApiMessage[],
  settings: ApiSettings,
  onChunk: (chunk: string) => void,
  signal?: AbortSignal,
  toolUseOptions?: ToolUseOptions,
): Promise<ApiUsage | void> {
  const { system, messages: initialAnth } = prepareAnthropicPayload(messages);
  let anthMessages = initialAnth;

  const tools = toolUseOptions?.tools;
  const executeTool = toolUseOptions?.executeTool;
  const maxRounds = toolUseOptions?.maxRounds ?? 5;

  let usage: ApiUsage | undefined;

  for (let round = 0; round <= maxRounds; round++) {
    const turn = await callAnthropicOnce(
      anthMessages,
      system,
      settings,
      onChunk,
      signal,
      tools,
    );
    usage = mergeUsage(usage, turn.usage);

    const toolUses = turn.assistantBlocks.filter((b) => b?.type === "tool_use") as Array<
      ContentPart & { id: string; name: string; input: Record<string, unknown> }
    >;
    if (toolUses.length === 0 || !executeTool) {
      return usage;
    }
    if (round === maxRounds) {
      anthMessages = [
        ...anthMessages,
        { role: "assistant", content: turn.assistantBlocks },
        {
          role: "user",
          content: toolUses.map((tu) => ({
            type: "tool_result",
            tool_use_id: tu.id,
            content: "[tool_error] tool-call rounds exhausted; respond with what you know",
          })),
        },
      ];
      const finalTurn = await callAnthropicOnce(
        anthMessages,
        system,
        settings,
        onChunk,
        signal,
        undefined,
      );
      return mergeUsage(usage, finalTurn.usage);
    }

    anthMessages = [
      ...anthMessages,
      { role: "assistant", content: turn.assistantBlocks },
    ];

    // 一轮里所有 tool_use 在同一条 user 消息里以 tool_result 数组回传
    // —— Anthropic 规范要求多个 tool_result 合并成一条 user 消息。
    const toolResults: ContentPart[] = [];
    for (const tu of toolUses) {
      const args = tu.input || {};
      const result = await executeTool(tu.name, args);
      toolUseOptions?.onToolEvent?.({
        round,
        name: tu.name,
        args,
        result,
      });
      const resultText: string = result.ok
        ? result.text
        : `[tool_error] ${result.message}`;
      toolResults.push({
        type: "tool_result",
        tool_use_id: tu.id,
        content: resultText,
      });
    }
    anthMessages = [
      ...anthMessages,
      { role: "user", content: toolResults },
    ];
  }

  return usage;
}
/**
 * 拉取模型列表，用于设置面板的 Provider 健康测试 + 模型选择下拉。
 *  - OpenAI 兼容：GET `${baseUrl}/models` + `Authorization: Bearer`
 *  - Anthropic：GET `${baseUrl}/models` + `x-api-key` + `anthropic-version`
 *
 * apiKey 留作可选 —— Ollama 这类本地服务不需要鉴权；真需要鉴权的服务
 * 由下游 401 自然给出明确错误。
 */
export async function fetchModels(
  settings: ApiSettings,
  signal?: AbortSignal,
): Promise<string[]> {
  const format = settings.apiFormat || "openai";
  const baseUrl = normalizeBaseUrl(settings.baseUrl);
  if (!baseUrl) throw new Error("Missing API Base URL");
  assertSafeBaseUrl(baseUrl);

  const url = `${baseUrl}/models`;
  const headers: Record<string, string> = { "Content-Type": "application/json" };

  if (format === "anthropic") {
    if (settings.apiKey) {
      headers["x-api-key"] = settings.apiKey;
      headers["Authorization"] = `Bearer ${settings.apiKey}`;
    }
    headers["anthropic-version"] = "2023-06-01";
    if (isOfficialAnthropicHost(baseUrl)) {
      headers["anthropic-dangerous-direct-browser-access"] = "true";
    }
  } else if (settings.apiKey) {
    headers["Authorization"] = `Bearer ${settings.apiKey}`;
  }

  const response = await fetchWithTimeout(
    url,
    { method: "GET", headers, referrerPolicy: "no-referrer" },
    signal,
  );
  if (!response.ok) {
    const errText = await response.text().catch(() => "");
    throw new ApiHttpError(response.status, errText);
  }

  const data = await response.json();
  const rawList: unknown[] = Array.isArray(data?.data)
    ? data.data
    : Array.isArray(data?.models)
      ? data.models
      : Array.isArray(data)
        ? data
        : [];

  const ids = rawList
    .map((m) => {
      if (typeof m === "string") return m;
      const obj = m as { id?: unknown; name?: unknown; model?: unknown };
      return (obj?.id || obj?.name || obj?.model) as string | undefined;
    })
    .filter((id): id is string => typeof id === "string" && id.length > 0);

  return Array.from(new Set(ids)).sort((a, b) => a.localeCompare(b));
}
