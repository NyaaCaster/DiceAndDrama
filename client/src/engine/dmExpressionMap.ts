/**
 * 8 个 ExpressionKey → emoji + 中文 hint 的字典。M5 上线像素精灵后
 * 整体替换成 `<img src={spriteFromKey(key)} />`，**key 字典不要动**——
 * 那是 LLM 与前端共享的契约（见 `.docs/dsl-spec.md` §三）。
 */
import type { ExpressionKey } from "./parseSceneBlocks";

interface ExpressionDisplay {
  emoji: string;
  /** 短中文标签，DialogueLog 卡片里 small 字号显示。 */
  label: string;
}

const MAP: Record<ExpressionKey, ExpressionDisplay> = {
  default: { emoji: "🐱", label: "默认" },
  "eye-roll": { emoji: "🙄", label: "翻白眼" },
  "ear-twitch": { emoji: "😾", label: "抽耳" },
  donut: { emoji: "🍩", label: "吃甜甜圈" },
  "petting-cat": { emoji: "😻", label: "撸猫" },
  surprised: { emoji: "😲", label: "惊讶" },
  smug: { emoji: "😼", label: "得意" },
  sleepy: { emoji: "😴", label: "瞌睡" },
};

export function getExpressionDisplay(key: ExpressionKey): ExpressionDisplay {
  return MAP[key];
}
