/**
 * 场景运行器：把"玩家输入 → LLM 一回合 → 解析 → 推 history → emit 事件"
 * 串成一个 await-able 的 `runTurn`。
 *
 * **不**做的事：
 * - LocalStorage 持久化（M7 双轨同步范围；M4 仅内存模型）
 * - tool 回环管理（由 `buildDiceToolUseOptions` 内部消化）
 * - 直接渲染 UI（只 emit `dm-turn-completed` / `dm-parse-warning`，
 *   组件订阅 history 变化即可）
 *
 * 历史窗口：默认 `history` 保留全量；发给 LLM 的"近期上下文"取最近 6 回合
 * 的 dialogue + game_state，避免 token 爆炸。LLM system 段每回合重新组装
 * （吐槽队列每回合都不同，所以 system 不缓存）。
 */
import {
  parseSceneBlocks,
  type ParseWarning,
  type SceneBlocks,
} from "./parseSceneBlocks";
import { gameEvents } from "../services/events/gameEvents";
import { drainSarcasmQueue } from "../services/dm/sarcasmTrigger";
import { buildDmSystemPrompt } from "../services/llm/dmSystemPrompt";
import { assembleMcpRules } from "../services/llm/mcpRules";
import { runDmTurn } from "../services/llm/runDmTurn";
import type { ApiMessage, ToolUseOptions } from "../services/llm/api";
import type { LlmStoreState } from "../services/llm/providers";

export interface SceneRunnerOptions {
  /** LLM Provider 快照。每次调用都重新读 active provider。 */
  store: LlmStoreState;
  /** 最近 N 回合喂给 LLM 作为上下文。默认 6。 */
  contextWindow?: number;
}

export interface RunTurnInput {
  /** 玩家本回合的发言（自由文本或 choice.label）。 */
  playerInput: string;
  /** 可选：tool-use 配置（开了 MCP 就传，否则不传）。 */
  toolUseOptions?: ToolUseOptions;
  /** 流式 raw chunk 回调；UI 把它推给 DialogueLog 的 streamingRaw。 */
  onChunk?: (raw: string) => void;
  /** 中断信号。 */
  signal?: AbortSignal;
}

export interface RunTurnResult {
  scene: SceneBlocks;
  warnings: ParseWarning[];
  /** LLM 的完整原始 raw 文本（含未识别块、散文等）。沙盒页面会展示。 */
  raw: string;
}

export class SceneRunner {
  private readonly history: SceneBlocks[] = [];
  private readonly contextWindow: number;
  private readonly options: SceneRunnerOptions;

  constructor(options: SceneRunnerOptions) {
    this.options = options;
    this.contextWindow = options.contextWindow ?? 6;
  }

  getHistory(): readonly SceneBlocks[] {
    return this.history;
  }

  /** 仅供切档 / 重开使用。 */
  resetHistory(): void {
    this.history.length = 0;
  }

  /** 直接 push 一条已解析好的 SceneBlocks（手输 DSL Tab 用）。 */
  pushScene(scene: SceneBlocks): void {
    this.history.push(scene);
  }

  async runTurn(input: RunTurnInput): Promise<RunTurnResult> {
    const sarcasm = drainSarcasmQueue();
    const advertised = input.toolUseOptions
      ? input.toolUseOptions.tools.map((t) => t.name)
      : [];
    const mcpRules = advertised.length > 0 ? assembleMcpRules(advertised) : null;
    const system = buildDmSystemPrompt({
      mcpRules,
      pendingSarcasm: sarcasm,
    });

    const messages: ApiMessage[] = [
      { role: "system", content: system },
      ...this.buildContextMessages(),
      { role: "user", content: input.playerInput },
    ];

    let raw = "";
    await runDmTurn(messages, {
      store: this.options.store,
      onChunk: (c) => {
        raw += c;
        input.onChunk?.(raw);
      },
      ...(input.signal !== undefined && { signal: input.signal }),
      ...(input.toolUseOptions !== undefined && {
        toolUseOptions: input.toolUseOptions,
      }),
    });

    const { scene, warnings } = parseSceneBlocks(raw);
    this.history.push(scene);

    const blocksOk = warnings.every((w) => w.kind !== "missing-block");
    gameEvents.emit("dm-turn-completed", {
      hadTool: advertised.length > 0,
      blocksOk,
    });
    if (warnings.length > 0) {
      gameEvents.emit("dm-parse-warning", { warnings });
    }

    return { scene, warnings, raw };
  }

  /**
   * 把最近 N 回合压缩成 user/assistant 交替的伪上下文。LLM 不需要看到
   * 完整四块，只看 dialogue + game_state 摘要就够了——再多就开始回顾
   * 整个剧本，token 爆炸。
   */
  private buildContextMessages(): ApiMessage[] {
    const recent = this.history.slice(-this.contextWindow);
    const out: ApiMessage[] = [];
    for (const scene of recent) {
      const lines: string[] = [];
      for (const d of scene.dialogue) {
        lines.push(`${d.speaker}: ${d.text}`);
      }
      const gs = scene.gameState;
      lines.push(
        `[state] location=${gs.location || "-"} turn=${gs.turn} quest=${gs.activeQuest || "-"} table_event=${gs.tableEvent ?? "-"}`,
      );
      out.push({ role: "assistant", content: lines.join("\n") });
    }
    return out;
  }
}
