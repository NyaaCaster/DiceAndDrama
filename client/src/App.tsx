import { useEffect, useRef, useState } from "react";
import { Dice5, Send, Settings2, Square } from "lucide-react";
import { APP_NAME, APP_VERSION, BLESSING } from "./version.ts";
import { LlmSettingsModal } from "./components/LlmSettingsModal";
import { DiceRoller } from "./components/DiceRoller";
import {
  loadLlmSettings,
  saveLlmSettings,
  type LlmSettingsSnapshot,
} from "./services/llm/storage";
import { runDmTurn } from "./services/llm/runDmTurn";
import { ApiHttpError, type ToolEvent } from "./services/llm/api";
import { assembleMcpRules } from "./services/llm/mcpRules";
import {
  buildDiceToolUseOptions,
  DICE_TOOL_NAMES,
  extractFinalRollValue,
} from "./services/mcp/diceTools";

/**
 * M3 沙盒：在 M2 textarea 之上叠了三件事——
 *   1. "MCP 工具" toggle：开了就 listTools + 注入 toolUseOptions（仅
 *      `roll_dnd`），关了走纯叙事
 *   2. "力量检定 demo" 按钮：一键塞一条会逼 LLM 调 roll_dnd 的 prompt
 *   3. ToolEvent 日志面板 + DiceRoller：tool_call 进来就刷到面板，
 *      若是骰子工具且能从结果里抓到最终骰点 → 触发像素骰动画"定格"
 *
 * M4 上线 SceneRunner / 四块 DSL 解析后整个 App.tsx 会被替换。
 */
const STRENGTH_DEMO_PROMPT =
  "请扮演 DM 猫娘 Nyaa，让玩家做一次力量检定（DC 15）撬开一扇生锈的铁门。" +
  "记得先调用 roll_dnd 拿到真随机骰值，再依据成败叙事化展开。";

interface ToolLogEntry {
  id: string;
  round: number;
  name: string;
  args: Record<string, unknown>;
  ok: boolean;
  text: string;
}

export default function App() {
  const [snapshot, setSnapshot] = useState<LlmSettingsSnapshot>(() =>
    loadLlmSettings(),
  );
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [output, setOutput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [mcpEnabled, setMcpEnabled] = useState(true);
  const [toolLog, setToolLog] = useState<ToolLogEntry[]>([]);
  const [diceRolling, setDiceRolling] = useState(false);
  const [diceFinal, setDiceFinal] = useState<number | undefined>(undefined);
  const abortRef = useRef<AbortController | null>(null);
  const diceTimerRef = useRef<number | null>(null);

  useEffect(
    () => () => {
      abortRef.current?.abort();
      if (diceTimerRef.current !== null) {
        window.clearTimeout(diceTimerRef.current);
      }
    },
    [],
  );

  const handleSaveSnapshot = (next: LlmSettingsSnapshot) => {
    setSnapshot(next);
    saveLlmSettings(next);
  };

  const handleToolEvent = (ev: ToolEvent) => {
    const text = ev.result.ok ? ev.result.text : ev.result.message;
    setToolLog((prev) => [
      ...prev,
      {
        id: `${ev.round}-${ev.name}-${prev.length}`,
        round: ev.round,
        name: ev.name,
        args: ev.args,
        ok: ev.result.ok,
        text,
      },
    ]);

    if (ev.result.ok && DICE_TOOL_NAMES.includes(ev.name)) {
      const finalValue = extractFinalRollValue(ev.result.text);
      if (finalValue !== undefined) {
        // 翻面 600ms 后定格到 finalValue。父组件控制 rolling=true→false 的节奏。
        setDiceFinal(undefined);
        setDiceRolling(true);
        if (diceTimerRef.current !== null) {
          window.clearTimeout(diceTimerRef.current);
        }
        diceTimerRef.current = window.setTimeout(() => {
          setDiceFinal(finalValue);
          setDiceRolling(false);
          diceTimerRef.current = null;
        }, 600);
      }
    }
  };

  const sendPrompt = async (text: string) => {
    if (streaming) return;
    setError(null);
    setOutput("");
    setToolLog([]);
    setDiceRolling(false);
    setDiceFinal(undefined);
    setStreaming(true);

    const ac = new AbortController();
    abortRef.current = ac;

    try {
      const toolUseOptions = mcpEnabled
        ? await buildDiceToolUseOptions({
            signal: ac.signal,
            onToolEvent: handleToolEvent,
          })
        : null;

      const systemSegments: string[] = [
        "你是猫娘 DM Nyaa，白发暗红瞳，蓝衣围桌，语气俏皮带尾巴尖上的喵。",
        "回复请使用简体中文。当前为 M3 沙盒，先确认骰子工具链路打通，叙事可以简短。",
      ];
      if (toolUseOptions) {
        const rules = assembleMcpRules(
          toolUseOptions.tools.map((t) => t.name),
        );
        if (rules) systemSegments.push(rules);
      }

      const messages = [
        { role: "system", content: systemSegments.join("\n\n") },
        { role: "user", content: text },
      ];

      await runDmTurn(messages, {
        store: snapshot,
        onChunk: (c) => setOutput((prev) => prev + c),
        signal: ac.signal,
        ...(toolUseOptions ? { toolUseOptions } : {}),
      });
    } catch (e) {
      if (ac.signal.aborted) {
        // 主动中断不算错
      } else if (e instanceof ApiHttpError) {
        setError(`HTTP ${e.status}：${truncate(e.body || e.message, 280)}`);
      } else if (e instanceof Error) {
        setError(e.message);
      } else {
        setError("未知错误");
      }
    } finally {
      setStreaming(false);
      abortRef.current = null;
    }
  };

  const handleSend = () => {
    const text = prompt.trim();
    if (!text) return;
    void sendPrompt(text);
  };

  const handleStrengthDemo = () => {
    setPrompt(STRENGTH_DEMO_PROMPT);
    void sendPrompt(STRENGTH_DEMO_PROMPT);
  };

  const handleStop = () => {
    abortRef.current?.abort();
  };

  const activeProvider = snapshot.llmProviders.find(
    (p) => p.id === snapshot.currentLlmProviderId,
  );
  const activeModel = activeProvider?.lastUsedModel || "";

  return (
    <main
      data-blessing={BLESSING}
      className="min-h-dvh w-full flex flex-col items-center bg-gradient-to-br from-indigo-950 via-slate-900 to-stone-900 text-stone-100 px-4 sm:px-6 py-8 sm:py-12 gap-6"
    >
      <header className="text-center space-y-2 relative w-full max-w-3xl">
        <button
          onClick={() => setSettingsOpen(true)}
          aria-label="LLM 设置"
          className="absolute right-0 top-0 inline-flex items-center gap-2 px-3 py-2 rounded-xl text-sm bg-white/5 hover:bg-white/10 border border-white/10 transition-all"
        >
          <Settings2 size={16} />
          <span className="hidden sm:inline">设置</span>
        </button>
        <p className="text-xs tracking-[0.4em] text-indigo-300/80 uppercase">
          骰子 与 戏精
        </p>
        <h1 className="text-4xl sm:text-5xl font-semibold tracking-tight">
          {APP_NAME}
        </h1>
        <p className="text-stone-400 text-sm">
          v{APP_VERSION} · 像素风元 TRPG · DM 由猫娘 Nyaa 担任
        </p>
      </header>

      <section className="max-w-md text-center space-y-3 text-stone-300/90 leading-relaxed">
        <p>*Nyaa 翘起尾巴尖，把骰子从桌沿拨下去，眯眼笑*</p>
        <p className="text-stone-400">
          喵～酒馆门还没推开，史莱姆已经在啃桌腿了。点"力量检定"看一眼骰子。
        </p>
      </section>

      <section className="w-full max-w-3xl bg-white/5 border border-white/10 rounded-2xl p-4 sm:p-5 space-y-3 backdrop-blur">
        <div className="flex items-center justify-between gap-3 text-xs text-stone-400">
          <span>
            当前：
            <span className="text-stone-200 font-mono">
              {activeProvider?.name || "（未选 Provider）"}
            </span>
            {activeModel && (
              <span className="ml-2 text-stone-500 font-mono">
                / {activeModel}
              </span>
            )}
          </span>
          <span className="font-mono text-stone-500">M3 沙盒</span>
        </div>

        <label className="inline-flex items-center gap-2 text-xs text-stone-300 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={mcpEnabled}
            onChange={(e) => setMcpEnabled(e.target.checked)}
            className="w-3.5 h-3.5 accent-indigo-400"
          />
          启用 MCP 骰子工具（roll_dnd）
        </label>

        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="输入一句话试试，或点下面的力量检定 demo。"
          rows={3}
          className="w-full px-4 py-3 rounded-xl bg-black/30 border border-white/10 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/30 outline-none transition-all resize-y font-sans text-sm"
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
              e.preventDefault();
              handleSend();
            }
          }}
        />

        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-stone-500">
              Ctrl/Cmd + Enter 发送
            </span>
            <button
              onClick={handleStrengthDemo}
              disabled={streaming}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500/15 hover:bg-amber-500/25 disabled:opacity-50 disabled:cursor-not-allowed border border-amber-400/30 text-amber-200 text-xs transition-all"
            >
              <Dice5 size={13} />
              力量检定 demo
            </button>
          </div>
          {streaming ? (
            <button
              onClick={handleStop}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-red-500/20 hover:bg-red-500/30 border border-red-400/30 text-red-200 transition-all"
            >
              <Square size={14} />
              停止
            </button>
          ) : (
            <button
              onClick={handleSend}
              disabled={!prompt.trim()}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-500 hover:bg-indigo-400 disabled:bg-indigo-500/30 disabled:cursor-not-allowed text-white transition-all"
            >
              <Send size={14} />
              发送
            </button>
          )}
        </div>

        {error && (
          <div className="text-xs text-red-300 bg-red-500/10 border border-red-400/20 rounded-xl px-3 py-2 break-all">
            {error}
          </div>
        )}

        {(diceRolling || diceFinal !== undefined) && (
          <div className="flex items-center gap-3 px-3 py-2 rounded-xl bg-black/20 border border-white/10">
            <DiceRoller rolling={diceRolling} finalValue={diceFinal} size={56} />
            <div className="text-xs text-stone-300">
              {diceRolling ? (
                <span>翻面中…等 MCP 真随机数定格</span>
              ) : (
                <span>
                  最终骰点：
                  <span className="font-mono font-bold text-amber-200 ml-1">
                    {diceFinal}
                  </span>
                </span>
              )}
            </div>
          </div>
        )}

        {toolLog.length > 0 && (
          <details
            open
            className="text-xs bg-black/20 border border-white/10 rounded-xl"
          >
            <summary className="px-3 py-2 cursor-pointer text-stone-300 select-none">
              工具调用日志 ({toolLog.length})
            </summary>
            <ul className="px-3 pb-3 space-y-2 list-none">
              {toolLog.map((entry) => (
                <li
                  key={entry.id}
                  className={`rounded-lg p-2 border ${
                    entry.ok
                      ? "bg-emerald-500/5 border-emerald-400/20"
                      : "bg-red-500/5 border-red-400/20"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2 text-[11px]">
                    <span className="font-mono">
                      <span className="text-stone-500">round {entry.round} ·</span>{" "}
                      <span className="text-amber-200">{entry.name}</span>
                    </span>
                    <span
                      className={
                        entry.ok ? "text-emerald-300" : "text-red-300"
                      }
                    >
                      {entry.ok ? "ok" : "fail"}
                    </span>
                  </div>
                  <pre className="mt-1 text-[11px] text-stone-400 whitespace-pre-wrap break-all font-mono">
                    args: {JSON.stringify(entry.args)}
                  </pre>
                  <pre className="mt-1 text-[11px] text-stone-200 whitespace-pre-wrap break-all">
                    {entry.text}
                  </pre>
                </li>
              ))}
            </ul>
          </details>
        )}

        {(output || streaming) && (
          <pre className="whitespace-pre-wrap text-sm leading-relaxed text-stone-200 bg-black/30 border border-white/10 rounded-xl p-3 font-sans max-h-[40vh] overflow-y-auto">
            {output}
            {streaming && (
              <span className="inline-block w-2 h-4 align-middle bg-indigo-300/80 animate-pulse ml-0.5" />
            )}
          </pre>
        )}
      </section>

      <footer className="mt-2 text-xs text-stone-500 font-mono">
        client boot ok · M3 MCP 工具沙盒就绪 · 等待 M4 DSL 引擎
      </footer>

      <LlmSettingsModal
        isOpen={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        snapshot={snapshot}
        onSave={handleSaveSnapshot}
      />
    </main>
  );
}

function truncate(s: string, n: number): string {
  return s.length <= n ? s : s.slice(0, n) + "…";
}
