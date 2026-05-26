import type { LlmProvider, ModelHealth } from "./types";
import { providerToApiSettings } from "./providers";
import { normalizeBaseUrl } from "./api";

/**
 * 最小成本的 chat-completion 探测。1 字符 prompt + max_tokens=1，仅用于
 * 确认"Key 有效 + 端点能路由到这个 model"，并捕捉一次 RTT。
 *
 * 2xx 返 ok=true + latencyMs；其余（含网络错误 / 超时 / abort）返
 * ok=false + 错误说明。30 秒上限，避免 misconfigured 代理把 UI 挂死。
 */
export async function runHealthCheck(
  provider: LlmProvider,
  modelId: string,
  signal?: AbortSignal,
): Promise<ModelHealth> {
  const start = performance.now();
  const testedAt = Date.now();
  const apiSettings = providerToApiSettings(provider, modelId);
  const baseUrl = normalizeBaseUrl(apiSettings.baseUrl);

  if (!baseUrl || !modelId) {
    return {
      ok: false,
      testedAt,
      error: "缺少 API 地址 / 模型 id",
    };
  }

  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), 30_000);
  const onAbort = () => ac.abort();
  if (signal) signal.addEventListener("abort", onAbort, { once: true });

  try {
    if (apiSettings.apiFormat === "anthropic") {
      await pingAnthropic(baseUrl, apiSettings.apiKey, modelId, ac.signal);
    } else {
      await pingOpenAI(baseUrl, apiSettings.apiKey, modelId, ac.signal);
    }
    return {
      ok: true,
      latencyMs: Math.round(performance.now() - start),
      testedAt,
    };
  } catch (err) {
    const isAbort =
      err instanceof DOMException && err.name === "AbortError";
    return {
      ok: false,
      latencyMs: Math.round(performance.now() - start),
      testedAt,
      error: isAbort
        ? "请求超时或已取消"
        : err instanceof Error
          ? err.message
          : String(err),
    };
  } finally {
    clearTimeout(timer);
    if (signal) signal.removeEventListener("abort", onAbort);
  }
}

async function pingOpenAI(
  baseUrl: string,
  apiKey: string,
  model: string,
  signal: AbortSignal,
) {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;
  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      model,
      messages: [{ role: "user", content: "hi" }],
      max_tokens: 1,
      stream: false,
    }),
    signal,
    referrerPolicy: "no-referrer",
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`HTTP ${res.status}${text ? `: ${text.slice(0, 80)}` : ""}`);
  }
}

async function pingAnthropic(
  baseUrl: string,
  apiKey: string,
  model: string,
  signal: AbortSignal,
) {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "anthropic-version": "2023-06-01",
  };
  if (apiKey) {
    headers.Authorization = `Bearer ${apiKey}`;
    headers["x-api-key"] = apiKey;
  }
  const res = await fetch(`${baseUrl}/messages`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      model,
      messages: [{ role: "user", content: "hi" }],
      max_tokens: 1,
    }),
    signal,
    referrerPolicy: "no-referrer",
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`HTTP ${res.status}${text ? `: ${text.slice(0, 80)}` : ""}`);
  }
}
