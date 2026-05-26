import { useEffect, useState } from "react";

/**
 * 像素掷骰动画。**前端只演不算** —— 最终值（`finalValue`）由 MCP
 * 返回值驱动，本组件只负责"翻面 ~rollDurationMs 后定格到 finalValue"。
 *
 * 工作模式：
 *   - finalValue=undefined 或 rolling=false：静态显示 `staticFace`（默认 ?）
 *   - rolling=true：每 80ms 随机翻一次面，rollDurationMs 后停在 finalValue
 *
 * 视觉是 6×6 的像素方格 SVG，36 像素/格在 size=72 时；M5 阶段会换成
 * 真正的精灵图，本组件先以"占位但好看"为目标。
 */
export interface DiceRollerProps {
  /** 是否处于翻面状态。父组件控制：发起 roll 时置 true，工具回包后置 false。 */
  rolling: boolean;
  /** MCP 返回的最终骰点。停止翻面时定格到这个值。undefined 时退回 staticFace。 */
  finalValue?: number;
  /** 翻面时长，单位毫秒。默认 600。父组件最少应让其覆盖 MCP 调用 RTT。 */
  rollDurationMs?: number;
  /** 翻面时随机数的上界（含），默认 20 —— 对齐 roll_dnd 的 d20 检定；
   *  战斗外的"百面骰"展示可传 100。 */
  randomMax?: number;
  /** 像素尺寸。默认 72。 */
  size?: number;
  /** 静止状态的占位文字。默认 "?"。 */
  staticFace?: string;
  /** 动画结束（即定格 finalValue）后回调；用于父组件继续推进剧情。 */
  onSettled?: (value: number | undefined) => void;
}

export function DiceRoller({
  rolling,
  finalValue,
  rollDurationMs = 600,
  randomMax = 100,
  size = 72,
  staticFace = "?",
  onSettled,
}: DiceRollerProps) {
  const [face, setFace] = useState<string>(staticFace);
  const [settled, setSettled] = useState(false);

  useEffect(() => {
    if (!rolling) {
      // 父组件结束 rolling 时定格到 finalValue（或 staticFace）。
      const next = finalValue !== undefined ? String(finalValue) : staticFace;
      setFace(next);
      if (!settled) {
        setSettled(true);
        onSettled?.(finalValue);
      }
      return;
    }

    setSettled(false);
    const timer = window.setInterval(() => {
      const n = Math.floor(Math.random() * (randomMax + 1));
      setFace(String(n));
    }, 80);
    const stopTimer = window.setTimeout(() => {
      window.clearInterval(timer);
    }, rollDurationMs);

    return () => {
      window.clearInterval(timer);
      window.clearTimeout(stopTimer);
    };
  }, [rolling, finalValue, rollDurationMs, randomMax, staticFace, onSettled, settled]);

  return (
    <div
      role="img"
      aria-label={rolling ? "正在掷骰" : `骰子结果：${face}`}
      style={{ width: size, height: size }}
      className={`relative inline-flex items-center justify-center select-none rounded-lg border-2 transition-colors ${
        rolling
          ? "bg-amber-500/20 border-amber-400/60 animate-pulse"
          : "bg-emerald-500/15 border-emerald-400/50"
      }`}
    >
      <span
        className="font-mono font-bold tabular-nums text-amber-100"
        style={{ fontSize: Math.round(size * 0.42) }}
      >
        {face}
      </span>
      <span
        aria-hidden="true"
        className="absolute -top-1.5 -right-1.5 text-[10px] tracking-wider text-amber-200/80 font-mono"
      >
        🎲
      </span>
    </div>
  );
}
