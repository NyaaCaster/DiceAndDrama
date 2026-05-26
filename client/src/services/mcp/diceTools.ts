/**
 * 把 NyaaChat-MCP 的 `roll_dnd` 暴露给 LLM 作为 tool-use。Dice & Drama 是
 * D&D 风奇幻冒险，CoC 调查向的 `roll_coc` 与无判定语义的通用 `roll_dice`
 * 都不在本游戏使用范围内。提供两件事：
 *
 *   1. `buildDiceToolUseOptions()`：异步组装 ToolUseOptions，喂给
 *      `runDmTurn` 的 `toolUseOptions` 字段。先 listTools 再过白名单，
 *      运行时若 MCP 不可达则返回 null —— 调用方应整段跳过 toolUse 注入，
 *      由 LLM 用文字降级。
 *
 *   2. `extractFinalRollValue()`：从工具返回的多行文本里摘出 mcpRules
 *      约定的"最终骰点"数字（粗体形式 `**17**` / `**🎲 17**`），驱动
 *      DiceRoller 像素动画"定格"到目标值。前端只演不算。
 */

import type {
  LlmTool,
  ToolEvent,
  ToolExecutionResult,
  ToolExecutor,
  ToolUseOptions,
} from "../llm/api";
import {
  ADVERTISED_TOOLS,
  callTool,
  filterAdvertised,
  listTools,
  type McpCallResult,
} from "./mcpApi";

export const DICE_TOOL_NAMES: readonly string[] = ADVERTISED_TOOLS;

/**
 * 把 MCP 返回的 McpTool[] 投影成 LlmTool[]。LLM 不需要 title（中文人类
 * 标签），只看 name + description + inputSchema。
 */
function toLlmTools(
  tools: { name: string; description: string; inputSchema?: unknown }[],
): LlmTool[] {
  return tools.map((t) => {
    const tool: LlmTool = {
      name: t.name,
      description: t.description,
    };
    if (t.inputSchema !== undefined) tool.inputSchema = t.inputSchema;
    return tool;
  });
}

export interface BuildDiceToolUseOptionsArgs {
  signal?: AbortSignal;
  onToolEvent?: (event: ToolEvent) => void;
  /** 工具循环最大轮数。默认 5，与 api.ts 一致。 */
  maxRounds?: number;
}

/**
 * 拉一遍 MCP 工具列表 → 过白名单 → 拼好 ToolUseOptions。MCP 不可达
 * （listTools 抛错）或白名单过滤后没工具时返回 null，调用方应据此降级
 * 为"无工具叙事"。
 */
export async function buildDiceToolUseOptions(
  args: BuildDiceToolUseOptionsArgs = {},
): Promise<ToolUseOptions | null> {
  let allTools: Awaited<ReturnType<typeof listTools>>;
  try {
    allTools = await listTools(args.signal);
  } catch {
    return null;
  }

  const dice = filterAdvertised(allTools);
  if (dice.length === 0) return null;

  const llmTools = toLlmTools(dice);

  const executor: ToolExecutor = async (
    name,
    callArgs,
  ): Promise<ToolExecutionResult> => {
    const r: McpCallResult = await callTool(name, callArgs, args.signal);
    return r.ok ? { ok: true, text: r.text } : { ok: false, message: r.message };
  };

  const opts: ToolUseOptions = {
    tools: llmTools,
    executeTool: executor,
  };
  if (args.onToolEvent) opts.onToolEvent = args.onToolEvent;
  if (args.maxRounds !== undefined) opts.maxRounds = args.maxRounds;
  return opts;
}

/**
 * 抽出 mcpRules.ts §"结果展示格式" 约定的最终骰点。MCP 上游的 roll_dnd
 * 在 text 里把最终骰点用粗体强调（可选带骰子 emoji 前缀）。攻击未命中
 * 等只返回元信息的回包匹配不到 → undefined，由 DiceRoller 自己决定要
 * 不要动画。
 *
 * 模式覆盖：
 *   - `**26**` / `**1**`（roll_dnd 标准检定）
 *   - `**🎲 17**` / `**🎲17**`（带骰子 emoji 强调）
 *   - 数字可能是负数（roll_dnd 减值修正）
 */
const FINAL_ROLL_RE = /\*\*(?:🎲\s*)?(-?\d+)\*\*/u;

export function extractFinalRollValue(text: string): number | undefined {
  const m = FINAL_ROLL_RE.exec(text);
  if (!m || !m[1]) return undefined;
  const n = parseInt(m[1], 10);
  return Number.isFinite(n) ? n : undefined;
}
