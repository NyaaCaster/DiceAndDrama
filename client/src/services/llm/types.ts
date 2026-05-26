/**
 * LLM 适配层公开类型。仅保留与 chat-completion / 工具调用 / 模型清单
 * 相关的最小集合 —— DM 叙事所需的额外结构（Scene 块、骰子事件等）由
 * engine/ 自己定义，不污染这里。
 */

export type ApiFormat = "openai" | "anthropic";

export type LlmProviderKind =
  | "qiny"
  | "gemini"
  | "anthropic"
  | "openai"
  | "deepseek"
  | "ollama"
  | "custom";

export interface ApiSettings {
  baseUrl: string;
  apiKey: string;
  model: string;
  isStreaming?: boolean;
  apiFormat?: ApiFormat;
}

export type ModelCapability =
  | "vision"
  | "web"
  | "reasoning"
  | "tools"
  | "structured";

export interface ModelHealth {
  ok: boolean;
  latencyMs?: number;
  testedAt?: number;
  error?: string;
}

export interface ModelEntry {
  id: string;
  name?: string;
  capabilities?: ModelCapability[];
  contextWindow?: number;
  maxOutput?: number;
  health?: ModelHealth;
}

export interface LlmProvider {
  id: string;
  kind: LlmProviderKind;
  name: string;
  enabled: boolean;
  apiKey: string;
  baseUrl: string;
  apiFormat: ApiFormat;
  models: ModelEntry[];
  lastUsedModel?: string;
}

export interface DmMessage {
  role: "system" | "user" | "assistant";
  content: string;
}
