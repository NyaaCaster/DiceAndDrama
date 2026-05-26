/**
 * DM 回合顶层入口。把 LlmProvider + 选中模型 + 一批 messages 转成
 * 一次完整的 chat completion 调用，封装掉 ApiSettings 组装的细节，
 * 让 engine 层只需要"塞 messages 进去 → 拿流式 chunk + 最终 usage"。
 *
 * 不在这里做的事（避免与 chat-app 的 chatPipeline 耦合）：
 *   - 拼 system prompt：DM 人格 / DSL 契约 / MCP 规则段由调用方组装好
 *   - 维护历史：SceneRunner 自己持久化轮次
 *   - 解析 [DM_VISUAL] / [DIALOGUE] / [GAME_STATE] / [ACTION_PROMPT]：
 *     由 engine/parseSceneBlocks.ts 处理（M4 落地）
 *
 * 失败模式：
 *   - 没有任何 enabled provider → 抛 NoActiveLlmProviderError
 *   - provider 没填模型 → 抛 NoLlmModelSelectedError
 *   - HTTP / 鉴权失败 → 透传 ApiHttpError（含 status/body）
 */

import {
  fetchChatCompletion,
  type ApiMessage,
  type ApiUsage,
  type ToolUseOptions,
} from "./api";
import {
  getActiveLlmProvider,
  providerToApiSettings,
  type LlmStoreState,
} from "./providers";
import type { LlmProvider } from "./types";

export class NoActiveLlmProviderError extends Error {
  constructor() {
    super("没有可用的 LLM Provider，请在设置面板中启用至少一个并填入 API Key。");
    this.name = "NoActiveLlmProviderError";
  }
}

export class NoLlmModelSelectedError extends Error {
  constructor(public readonly providerName: string) {
    super(`Provider "${providerName}" 还未选择模型，请在设置面板中先选一个。`);
    this.name = "NoLlmModelSelectedError";
  }
}

export interface RunDmTurnOptions {
  /** 流式 token 回调；每次拿到一段文本就 push 给 UI 的 Typewriter。 */
  onChunk: (chunk: string) => void;
  /** 取消信号：用户点"停止"或切场景时 abort。 */
  signal?: AbortSignal;
  /** 显式指定模型 id；不传则回落到 provider.lastUsedModel。 */
  model?: string;
  /** 是否流式（默认 true）。健康测试 / 工具回环可以传 false。 */
  isStreaming?: boolean;
  /** Tool-use 配置：MCP 骰子工具 + 执行器，在 M3 之后才填。 */
  toolUseOptions?: ToolUseOptions;
  /** 直接指定 Provider，跳过 store 查询；用于设置面板里的"测试连接"按钮。 */
  provider?: LlmProvider;
  /** Store 快照：当 provider 没显式传时从这里查 active provider。 */
  store?: LlmStoreState;
}

/**
 * 跑一轮 DM 对话。返回 ApiUsage（input/output/cache token 统计）；
 * 失败时抛错，由 UI 层统一展示。
 */
export async function runDmTurn(
  messages: ApiMessage[],
  options: RunDmTurnOptions,
): Promise<ApiUsage | void> {
  const provider = options.provider ?? resolveProvider(options.store);
  if (!provider) throw new NoActiveLlmProviderError();

  const modelId = options.model || provider.lastUsedModel || "";
  if (!modelId) throw new NoLlmModelSelectedError(provider.name);

  const settings = providerToApiSettings(
    provider,
    modelId,
    options.isStreaming ?? true,
  );

  return fetchChatCompletion(
    messages,
    settings,
    options.onChunk,
    options.signal,
    options.toolUseOptions,
  );
}

function resolveProvider(store?: LlmStoreState): LlmProvider | undefined {
  if (!store) return undefined;
  return getActiveLlmProvider(store);
}
