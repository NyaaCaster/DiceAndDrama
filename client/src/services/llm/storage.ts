/**
 * LLM 设置的 LocalStorage 持久化层。仅这一个键里包含 API Key 等
 * 敏感凭据 —— **永远不会**经过任何后端，也不会进 LLM 请求体之外的其他通道。
 *
 * Schema 版本化：未来字段不兼容变更要 bump SCHEMA_VERSION 并写迁移逻辑；
 * 当前未知 / 损坏 / 旧版本的本地数据一律降级为"没有任何 provider"，
 * 由 UI 引导用户重填。
 *
 * 不在这里做的事：
 *   - 默认 provider 列表的生成（在 providers.ts 的 createDefaultLlmProviders）
 *   - 设置面板的 React 状态管理（由调用方组件 useState/useReducer 持有）
 */

import { createDefaultLlmProviders } from "./providers";
import type { LlmProvider } from "./types";

const STORAGE_KEY = "dicedrama:llm-settings";
const SCHEMA_VERSION = 1;

interface LlmSettingsPayloadV1 {
  schemaVersion: 1;
  llmProviders: LlmProvider[];
  currentLlmProviderId: string;
}

export interface LlmSettingsSnapshot {
  llmProviders: LlmProvider[];
  currentLlmProviderId: string;
}

/**
 * 读取 LocalStorage，返回反序列化后的设置快照。
 * 若不存在 / 损坏 / schema 版本不匹配，返回一份"开箱即用"的默认值
 * （六家预设 provider，全 enabled、apiKey 为空，currentLlmProviderId 指向第一家）。
 */
export function loadLlmSettings(): LlmSettingsSnapshot {
  if (typeof localStorage === "undefined") return makeDefault();

  let raw: string | null = null;
  try {
    raw = localStorage.getItem(STORAGE_KEY);
  } catch {
    return makeDefault();
  }
  if (!raw) return makeDefault();

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return makeDefault();
  }

  if (!isV1Payload(parsed)) return makeDefault();

  return {
    llmProviders: parsed.llmProviders,
    currentLlmProviderId: parsed.currentLlmProviderId,
  };
}

/**
 * 写回 LocalStorage。失败（quota / 隐身模式）静默吞掉，
 * 由调用方根据需要在 UI 提示；这里不抛错以免阻塞用户操作。
 */
export function saveLlmSettings(snapshot: LlmSettingsSnapshot): void {
  if (typeof localStorage === "undefined") return;
  const payload: LlmSettingsPayloadV1 = {
    schemaVersion: SCHEMA_VERSION,
    llmProviders: snapshot.llmProviders,
    currentLlmProviderId: snapshot.currentLlmProviderId,
  };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    /* swallow */
  }
}

/** 清空设置（用于"恢复出厂"按钮 / 单测）。下次 load 会拿到默认快照。 */
export function clearLlmSettings(): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* swallow */
  }
}

function makeDefault(): LlmSettingsSnapshot {
  const providers = createDefaultLlmProviders();
  return {
    llmProviders: providers,
    currentLlmProviderId: providers[0]?.id ?? "",
  };
}

function isV1Payload(v: unknown): v is LlmSettingsPayloadV1 {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  if (o.schemaVersion !== 1) return false;
  if (!Array.isArray(o.llmProviders)) return false;
  if (typeof o.currentLlmProviderId !== "string") return false;
  return o.llmProviders.every(isLlmProvider);
}

function isLlmProvider(v: unknown): v is LlmProvider {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  return (
    typeof o.id === "string" &&
    typeof o.kind === "string" &&
    typeof o.name === "string" &&
    typeof o.enabled === "boolean" &&
    typeof o.apiKey === "string" &&
    typeof o.baseUrl === "string" &&
    typeof o.apiFormat === "string" &&
    Array.isArray(o.models)
  );
}
