import type {
  ApiFormat,
  ApiSettings,
  LlmProvider,
  LlmProviderKind,
} from "./types";

/**
 * 预设的 LLM 供应商元信息。`baseUrlEditable=false` 表示官方接入端固定，
 * 用户只填 apiKey；`true` 表示用户可以指向自家代理 / 本地端口（Ollama / 自定义）。
 *
 * 新增 Provider：
 *   1. 加 `LlmProviderKind` 联合
 *   2. 在这里加一行预设
 *   3. createDefaultLlmProviders 会自动把它纳入默认列表
 */
export interface LlmProviderPresetMeta {
  kind: LlmProviderKind;
  name: string;
  baseUrl: string;
  apiFormat: ApiFormat;
  baseUrlEditable: boolean;
}

export const LLM_PROVIDER_PRESETS: LlmProviderPresetMeta[] = [
  {
    kind: "qiny",
    name: "QinyAPI",
    baseUrl: "https://openai.chatnewai.com/v1",
    apiFormat: "openai",
    baseUrlEditable: false,
  },
  {
    kind: "gemini",
    name: "Google Gemini",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
    apiFormat: "openai",
    baseUrlEditable: false,
  },
  {
    kind: "anthropic",
    name: "Anthropic Claude",
    baseUrl: "https://api.anthropic.com/v1",
    apiFormat: "anthropic",
    baseUrlEditable: false,
  },
  {
    kind: "openai",
    name: "OpenAI",
    baseUrl: "https://api.openai.com/v1",
    apiFormat: "openai",
    baseUrlEditable: false,
  },
  {
    kind: "deepseek",
    name: "DeepSeek",
    baseUrl: "https://api.deepseek.com/v1",
    apiFormat: "openai",
    baseUrlEditable: false,
  },
  {
    kind: "ollama",
    name: "Ollama",
    baseUrl: "http://localhost:11434",
    apiFormat: "openai",
    baseUrlEditable: true,
  },
];

export function getPresetMeta(kind: LlmProviderKind): LlmProviderPresetMeta | undefined {
  return LLM_PROVIDER_PRESETS.find((p) => p.kind === kind);
}

/**
 * 推断 baseUrl 属于哪个预设。用于用户粘贴一条 URL 后自动选中正确的
 * Provider；匹配失败回落 "custom"，让用户走自由编辑路径。
 */
/**
 * Qiny 在两个域名下都对外提供同一套 OpenAI 兼容接口。设置面板里以
 * `.COM / .icu` 单选切换 baseUrl，inferProvider 也要把两条域名都映射回 qiny。
 */
export const QINY_BASE_URLS = {
  com: "https://openai.chatnewai.com/v1",
  icu: "https://love.qinyan.icu/v1",
} as const;

export type QinyBaseKey = keyof typeof QINY_BASE_URLS;

export function getQinyBaseKey(baseUrl: string): QinyBaseKey {
  return (baseUrl || "").toLowerCase().includes("qinyan.icu") ? "icu" : "com";
}

export function inferProvider(baseUrl: string): LlmProviderKind {
  const lower = (baseUrl || "").toLowerCase();
  if (!lower) return "custom";
  if (lower.includes("chatnewai.com") || lower.includes("qinyan.icu")) return "qiny";
  if (lower.includes("generativelanguage.googleapis.com")) return "gemini";
  if (lower.includes("anthropic.com")) return "anthropic";
  if (lower.includes("api.openai.com")) return "openai";
  if (lower.includes("deepseek.com")) return "deepseek";
  if (lower.includes("11434")) return "ollama";
  return "custom";
}

function makeId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `llm_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * 生成"开箱即用"的默认 Provider 列表：六家预设各一条，全部 enabled，
 * apiKey 为空。用户在设置面板里填 Key 即可使用。
 */
export function createDefaultLlmProviders(): LlmProvider[] {
  return LLM_PROVIDER_PRESETS.map((preset) => ({
    id: makeId(),
    kind: preset.kind,
    name: preset.name,
    enabled: true,
    apiKey: "",
    baseUrl: preset.baseUrl,
    apiFormat: preset.apiFormat,
    models: [],
  }));
}

/**
 * 把 LlmProvider + 选中的 modelId 转成 fetchChatCompletion 接受的
 * ApiSettings。空模型会回落到 lastUsedModel；都没有时返回 ""，
 * 由调用方在发送前校验。
 */
export function providerToApiSettings(
  provider: LlmProvider,
  modelId?: string,
  isStreaming = true,
): ApiSettings {
  return {
    baseUrl: provider.baseUrl,
    apiKey: provider.apiKey,
    model: modelId || provider.lastUsedModel || "",
    apiFormat: provider.apiFormat,
    isStreaming,
  };
}

export interface LlmStoreState {
  llmProviders: LlmProvider[];
  currentLlmProviderId: string;
}

/**
 * 在当前 store 中找到正在使用的 Provider。找不到时回落到第一个
 * enabled=true 的 Provider；都没有就回 undefined（UI 应提示用户先配置）。
 */
export function getActiveLlmProvider(state: LlmStoreState): LlmProvider | undefined {
  const { llmProviders, currentLlmProviderId } = state;
  const direct = llmProviders.find((p) => p.id === currentLlmProviderId);
  if (direct) return direct;
  return llmProviders.find((p) => p.enabled);
}
