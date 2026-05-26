/**
 * NyaaChat-MCP 客户端。所有请求走同源反代 `/api/mcp`，由 nginx 在 envsubst
 * 时注入 `Authorization: Bearer ${MCP_API_KEY}` —— Bearer 永不进前端 bundle。
 *
 * MCP 上游是 streamable-HTTP，单次 POST 请求对应单次 JSON-RPC 调用，无
 * `initialize` 握手。响应可能是 SSE（`event: message\ndata: {...}`）也可能
 * 是裸 JSON，两种都解析。
 *
 * 错误处理策略：tool 调用失败不抛错，统一返回 `{ ok: false, message }`，
 * 让 LLM 工具循环把失败信号当作"上一步没拿到结果"喂回下一轮，而不是
 * 把整个回合挂掉。
 */

const MCP_ENDPOINT = "/api/mcp";
const MCP_HEALTH_ENDPOINT = "/api/mcp/health";

const REQUEST_TIMEOUT_MS = 30_000;
const HEALTH_TIMEOUT_MS = 5_000;

export interface McpTool {
  name: string;
  /** 服务端 `registerTool({title})` 提供的中文标题；老版本服务可能没有，
   *  回落 `name`。 */
  title: string;
  description: string;
  inputSchema?: Record<string, unknown>;
}

export type McpHealth =
  | { ok: true; latencyMs: number; name?: string; version?: string }
  | { ok: false; latencyMs: number; error: string };

export type McpCallResult =
  | { ok: true; text: string }
  | { ok: false; message: string };

interface JsonRpcSuccess<T> {
  jsonrpc: "2.0";
  id: number | string;
  result: T;
}
interface JsonRpcError {
  jsonrpc: "2.0";
  id: number | string | null;
  error: { code: number; message: string; data?: unknown };
}

interface ToolCallResultPayload {
  content?: Array<{ type: string; text?: string }>;
  isError?: boolean;
}

let nextRpcId = 1;

async function fetchWithTimeout(
  input: RequestInfo,
  init: RequestInit,
  signal: AbortSignal | undefined,
  timeoutMs: number,
): Promise<Response> {
  const ctrl = new AbortController();
  let timedOut = false;
  const link = () => ctrl.abort();
  if (signal) {
    if (signal.aborted) ctrl.abort();
    else signal.addEventListener("abort", link, { once: true });
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
    if (signal) signal.removeEventListener("abort", link);
  }
}

/**
 * 解析 SSE 或裸 JSON 响应。streamable-HTTP 上游可能两种都用，看具体调用
 * 走的是流式还是一次性返回。
 */
function parseSseOrJson(raw: string): unknown {
  const trimmed = raw.trim();
  if (!trimmed) throw new Error("MCP 服务返回空响应");
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    return JSON.parse(trimmed);
  }
  for (const line of trimmed.split(/\r?\n/)) {
    if (line.startsWith("data:")) {
      const payload = line.slice(5).trim();
      if (payload && payload !== "[DONE]") return JSON.parse(payload);
    }
  }
  throw new Error("MCP 服务响应格式无法解析");
}

async function rpc<T>(
  method: string,
  params: Record<string, unknown>,
  signal: AbortSignal | undefined,
  timeoutMs: number,
): Promise<T> {
  const body = JSON.stringify({
    jsonrpc: "2.0",
    id: nextRpcId++,
    method,
    params,
  });

  const res = await fetchWithTimeout(
    MCP_ENDPOINT,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
      },
      body,
      referrerPolicy: "no-referrer",
    },
    signal,
    timeoutMs,
  );

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    if (res.status === 401) {
      throw new Error(
        "MCP 鉴权失败（HTTP 401）：检查 .env 中的 MCP_API_KEY 是否与上游一致",
      );
    }
    throw new Error(`MCP HTTP ${res.status}: ${text.slice(0, 200)}`);
  }

  const parsed = parseSseOrJson(await res.text()) as
    | JsonRpcSuccess<T>
    | JsonRpcError;
  if ("error" in parsed) {
    const e = parsed.error;
    throw new Error(`MCP 错误 ${e.code}: ${e.message}`);
  }
  return parsed.result;
}

/**
 * 探活。成功失败都 resolve 同一种 discriminated union，UI 可以无 try/catch
 * 直接驱动红绿点。
 */
export async function ping(signal?: AbortSignal): Promise<McpHealth> {
  const start = Date.now();
  try {
    const res = await fetchWithTimeout(
      MCP_HEALTH_ENDPOINT,
      { method: "GET", referrerPolicy: "no-referrer" },
      signal,
      HEALTH_TIMEOUT_MS,
    );
    const latencyMs = Date.now() - start;
    if (!res.ok) {
      return { ok: false, latencyMs, error: `HTTP ${res.status}` };
    }
    const body: { status?: unknown; name?: unknown; version?: unknown } =
      await res.json().catch(() => ({}));
    const ok = body?.status === "ok";
    const name = typeof body?.name === "string" ? body.name : undefined;
    const version =
      typeof body?.version === "string" ? body.version : undefined;
    if (ok) {
      return { ok: true, latencyMs, name, version };
    }
    return {
      ok: false,
      latencyMs,
      error: typeof body?.status === "string" ? body.status : "unhealthy",
    };
  } catch (err: unknown) {
    return {
      ok: false,
      latencyMs: Date.now() - start,
      error: err instanceof Error ? err.message : "网络错误",
    };
  }
}

export async function listTools(signal?: AbortSignal): Promise<McpTool[]> {
  const result = await rpc<{ tools: McpTool[] }>(
    "tools/list",
    {},
    signal,
    REQUEST_TIMEOUT_MS,
  );
  return (result.tools ?? []).map((t) => ({
    ...t,
    title: t.title || t.name,
  }));
}

/**
 * 调用工具。三种失败模式（传输 / JSON-RPC / 工具 isError）都收敛到
 * `{ ok: false, message }`，给 LLM tool-use 循环喂结构化失败信号。
 */
export async function callTool(
  name: string,
  args: Record<string, unknown> = {},
  signal?: AbortSignal,
): Promise<McpCallResult> {
  let payload: ToolCallResultPayload;
  try {
    payload = await rpc<ToolCallResultPayload>(
      "tools/call",
      { name, arguments: args },
      signal,
      REQUEST_TIMEOUT_MS,
    );
  } catch (err: unknown) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : "MCP 调用失败",
    };
  }

  const text = (payload.content ?? [])
    .filter((p) => p?.type === "text" && typeof p.text === "string")
    .map((p) => p.text!)
    .join("\n")
    .trim();

  if (payload.isError) {
    return { ok: false, message: text || "工具返回 isError" };
  }
  if (!text) {
    return { ok: false, message: "工具返回空内容" };
  }
  return { ok: true, text };
}

/**
 * Dice & Drama 只广告 `roll_dnd` 一件套；time/weather/coc/通用 dice 等其他
 * NyaaChat-MCP 工具不在本游戏使用范围内（CoC 路线是恐怖调查向，与本作
 * D&D 风奇幻冒险不搭；通用 roll_dice 没有"判定"语义，也不进 LLM 工具表
 * —— 伤害骰之类的次级随机由 DM 文字直接叙述）。如果将来要新增工具，
 * 同步更新这里 + diceTools.ts 的 LlmTool 映射 + mcpRules.ts 的规则段。
 */
export const ADVERTISED_TOOLS: readonly string[] = ["roll_dnd"];

export function filterAdvertised(tools: McpTool[]): McpTool[] {
  const allow = new Set(ADVERTISED_TOOLS);
  return tools.filter((t) => allow.has(t.name));
}
