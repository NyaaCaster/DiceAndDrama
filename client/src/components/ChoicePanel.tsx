import { useState } from "react";
import { Send } from "lucide-react";
import type { ActionPrompt } from "../engine/parseSceneBlocks";

/**
 * 玩家输入面板。形态由当前回合的 `actionPrompt.kind` 决定：
 *   - `choices`  → 1-4 个按钮（键盘 1-4 留 M8）
 *   - `free-text` → 自由输入框 + 发送
 *   - `none`      → 空白 + 一行 hint（cinematic 过场）
 *
 * `disabled` 在流式中设 true，避免重复提交；`onSubmit` payload 形如：
 *   - { kind: "choice"; id; label } / { kind: "free-text"; text }
 */
export type ChoicePanelSubmit =
  | { kind: "choice"; id: string; label: string }
  | { kind: "free-text"; text: string }
  | { kind: "continue" };

interface ChoicePanelProps {
  prompt: ActionPrompt;
  disabled?: boolean;
  onSubmit: (payload: ChoicePanelSubmit) => void;
}

export function ChoicePanel({
  prompt,
  disabled = false,
  onSubmit,
}: ChoicePanelProps) {
  if (prompt.kind === "choices") {
    return (
      <div className="space-y-2">
        {prompt.choices.length === 0 ? (
          <p className="text-xs text-stone-500 italic">
            （Nyaa 没给选项，等等再说）
          </p>
        ) : (
          prompt.choices.map((c) => (
            <button
              key={c.id}
              type="button"
              disabled={disabled}
              onClick={() => onSubmit({ kind: "choice", id: c.id, label: c.label })}
              className="w-full text-left px-4 py-3 rounded-xl bg-white/5 hover:bg-indigo-500/15 border border-white/10 hover:border-indigo-400/40 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            >
              <span className="font-mono text-stone-500 mr-2">{c.id}.</span>
              <span className="text-stone-100 text-sm">{c.label}</span>
            </button>
          ))
        )}
      </div>
    );
  }

  if (prompt.kind === "free-text") {
    return (
      <FreeTextInput
        placeholder={prompt.placeholder}
        disabled={disabled}
        onSubmit={(text) => onSubmit({ kind: "free-text", text })}
      />
    );
  }

  return (
    <div className="flex items-center justify-between gap-3 px-3 py-3 rounded-xl bg-black/20 border border-white/10">
      <span className="text-xs text-stone-400">
        Nyaa 还在演，按右边的钮让她继续。
      </span>
      <button
        type="button"
        disabled={disabled}
        onClick={() => onSubmit({ kind: "continue" })}
        className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-indigo-500/20 hover:bg-indigo-500/30 border border-indigo-400/30 text-indigo-100 text-xs disabled:opacity-50 disabled:cursor-not-allowed"
      >
        让 Nyaa 继续
      </button>
    </div>
  );
}

function FreeTextInput({
  placeholder,
  disabled,
  onSubmit,
}: {
  placeholder: string;
  disabled: boolean;
  onSubmit: (text: string) => void;
}) {
  const [text, setText] = useState("");

  const trimmed = text.trim();
  const send = () => {
    if (!trimmed || disabled) return;
    onSubmit(trimmed);
    setText("");
  };

  return (
    <div className="flex items-stretch gap-2">
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={placeholder || "你打算怎么做？"}
        rows={2}
        disabled={disabled}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            send();
          }
        }}
        className="flex-1 px-4 py-3 rounded-xl bg-black/30 border border-white/10 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/30 outline-none transition-all resize-y font-sans text-sm disabled:opacity-50"
      />
      <button
        type="button"
        onClick={send}
        disabled={disabled || !trimmed}
        className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-500 hover:bg-indigo-400 disabled:bg-indigo-500/30 disabled:cursor-not-allowed text-white transition-all flex-shrink-0"
      >
        <Send size={14} />
        发送
      </button>
    </div>
  );
}
