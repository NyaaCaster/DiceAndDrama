import { useEffect, useRef, useState } from "react";

/**
 * 受控打字机。父组件每收到一段流式 chunk 就把累计 text 传进来；
 * 组件按字符（中文按单字）在内部以 `speedMs` 节奏推进 `cursor`，
 * 直到追上外部 text。`instant` 模式直接显示完整 text，用于历史回合。
 *
 * 不在内部缓存"已显示"的字符串——纯按 `cursor` 截断 `text.slice(0, cursor)`，
 * 保证 text 收缩时（极少见，比如父组件重置）能立刻跟随。
 */
interface TypewriterProps {
  text: string;
  speedMs?: number;
  onDone?: () => void;
  instant?: boolean;
  className?: string;
}

export function Typewriter({
  text,
  speedMs = 24,
  onDone,
  instant = false,
  className,
}: TypewriterProps) {
  const [cursor, setCursor] = useState(0);
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  useEffect(() => {
    if (instant) {
      setCursor(text.length);
      return;
    }
    if (cursor > text.length) {
      setCursor(text.length);
      return;
    }
    if (cursor === text.length) {
      onDoneRef.current?.();
      return;
    }
    const id = window.setTimeout(() => {
      setCursor((c) => Math.min(c + 1, text.length));
    }, speedMs);
    return () => window.clearTimeout(id);
  }, [text, cursor, speedMs, instant]);

  const visible = instant ? text : text.slice(0, cursor);
  const showCaret = !instant && cursor < text.length;

  return (
    <span className={className}>
      {visible}
      {showCaret && (
        <span className="inline-block w-1.5 h-4 align-middle bg-indigo-300/80 animate-pulse ml-0.5" />
      )}
    </span>
  );
}
