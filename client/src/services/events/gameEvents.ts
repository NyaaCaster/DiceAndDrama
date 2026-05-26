/**
 * Dice & Drama 全局领域事件总线。`mitt` 驱动的 typed pub-sub，所有
 * 跨层联动（UI → 引擎 → DM 吐槽 → 存档同步）都走它，避免组件之间
 * 互相 prop 依赖。
 *
 * 设计原则：
 * - 事件名 kebab-case，过去式或被动式，描述"发生了什么"而非"该做什么"
 * - 形状用 type 而非 interface，全部为 readonly 字面量，emit 时即冻结
 * - 命名映射来自 `.ref/kopp2_rf/02-adoption-notes.md` §4，但只取语义、
 *   重写为 kebab-case + 自定义 payload，**不**抄 PascalCase 原名
 *
 * M4 阶段实际 emit 的只有头 6 个；剩余 14 个作为类型占位先行就位，
 * M6 玩法系统落地时陆续点亮，避免 listener 文件每次 M-系列都改 import。
 */
import mitt, { type Emitter } from "mitt";

import type { ParseWarning } from "../../engine/parseSceneBlocks";

/** 骰子工具完整调用结果，供 DiceRoller 翻面 + sarcasmTrigger 计连续大失败用。 */
export interface DiceRolledPayload {
  /** 工具名，目前只有 "roll_dnd"。 */
  tool: string;
  /** 调用入参（透传，便于复盘）。 */
  args: Record<string, unknown>;
  /** 最终骰点（含修正）。 */
  finalValue: number;
  /** d20 自然 20 暴击。 */
  isCritical: boolean;
  /** d20 自然 1 必失。 */
  isFumble: boolean;
}

/**
 * 全部领域事件 + payload 形状。新增事件请按"何时 emit / 谁 listen"
 * 在注释里说一句，避免事件墓园。
 */
export type GameEventMap = {
  // ── M4 已点亮 ───────────────────────────────────────────────────
  /** roll_dnd 工具回环完成、最终骰点已知。emit: diceTools onToolEvent。listen: DiceRoller / sarcasmTrigger。 */
  "dice-rolled": DiceRolledPayload;
  /** 玩家进入新场景（第一次或回访）。emit: SceneRunner.enterScene。listen: 存档同步 / 旁白。 */
  "scene-entered": { sceneId: string; isFirstVisit: boolean };
  /** 玩家在 ChoicePanel 选了一项。emit: ChoicePanel onClick。listen: SceneRunner.runTurn。 */
  "choice-picked": { choiceId: string; label: string };
  /** 玩家在 ChoicePanel 自由文本提交。emit: ChoicePanel submit。listen: SceneRunner.runTurn。 */
  "free-text-submitted": { text: string; charCount: number };
  /** 一轮 DM 流式回复结束并解析完毕。emit: SceneRunner.runTurn。listen: 存档 / 沙盒页 telemetry。 */
  "dm-turn-completed": { hadTool: boolean; blocksOk: boolean };
  /** 解析器警告。emit: SceneRunner.runTurn。listen: sarcasmTrigger（仅 dev 模式）/ 沙盒 warnings 面板。 */
  "dm-parse-warning": { warnings: ParseWarning[] };

  // ── M6 玩法系统点亮（先占类型坑） ──────────────────────────────
  /** 主动技能 / 被动 trigger 命中。emit: SkillSystem。 */
  "skill-used": { skillId: string; actorId: string; targetId?: string };
  /** 怪物 HP ≤ 0。emit: CombatSystem。 */
  "monster-killed": { monsterId: string; xpReward: number };
  /** 任意金币变动（正/负）。emit: Inventory。 */
  "spent-gold": { delta: number; reason: string };
  /** 任意 HP 变动（正/负）。emit: CombatSystem / Heal。 */
  "hp-changed": { actorId: string; delta: number; current: number; max: number };
  /** 任务领取。emit: QuestLog。 */
  "quest-started": { questId: string; sourceNpcId?: string };
  /** 任务完成（不一定成功，分支不同）。emit: QuestLog。 */
  "quest-completed": { questId: string; outcome: "success" | "failure" };
  /** 物品入背包。emit: Inventory。 */
  "item-acquired": { itemId: string; count: number; source: string };
  /** 角色升级。emit: Progression。 */
  "level-up": { actorId: string; level: number };
  /** Boss 战胜利。emit: CombatSystem。 */
  "boss-defeated": { bossId: string; turns: number };
  /** 桌面事件触发（外卖到了 / 零食洒了…）。emit: TableEventDirector。 */
  "table-event-fired": { eventId: string; description: string };
  /** 工具调用失败（HTTP / 鉴权 / 上游异常）。emit: dispatchLlm tool 回环。 */
  "tool-error": { tool: string; error: string };
  /** 设置面板写入。emit: storage layer。listen: 引擎重新 instance。 */
  "settings-changed": { scope: "llm" | "audio" | "ui" };
  /** 云存档拉取完成。emit: cloudsave client。 */
  "save-loaded": { slotId: string; tookMs: number };
  /** 云存档写入完成。emit: cloudsave client。 */
  "save-written": { slotId: string; tookMs: number };
};

/** 单例，全局共享。**禁止**在测试外重新 new —— 测试里用 `gameEvents.all.clear()` 清。 */
export const gameEvents: Emitter<GameEventMap> = mitt<GameEventMap>();
