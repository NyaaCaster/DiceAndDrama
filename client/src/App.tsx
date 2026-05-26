import { useEffect, useRef, useState } from "react";
import { Settings2, Send, Square } from "lucide-react";
import { APP_NAME, APP_VERSION, BLESSING } from "./version.ts";
import { LlmSettingsModal } from "./components/LlmSettingsModal";
import {
  loadLlmSettings,
  saveLlmSettings,
  type LlmSettingsSnapshot,
} from "./services/llm/storage";
import { runDmTurn } from "./services/llm/runDmTurn";
import { ApiHttpError } from "./services/llm/api";

/**
 * M2 阶段的"对话沙盒"。一个最朴素的 textarea + 发送按钮 + 流式输出区，
 * 用来确认 LLM 适配层确实跑通了 —— 不是产品级 UI，M4 落地 SceneRunner /
 * Typewriter / DialogueLog 之后会被替换掉。
 */
export default function App() {
  const [snapshot, setSnapshot] = useState<LlmSettingsSnapshot>(() =>
    loadLlmSettings(),
  );
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [output, setOutput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => () => abortRef.current?.abort(), []);

  const handleSaveSnapshot = (next: LlmSettingsSnapshot) => {
    setSnapshot(next);
    saveLlmSettings(next);
  };

  const handleSend = async () => {
    if (streaming) return;
    const text = prompt.trim();
    if (!text) return;
    setError(null);
    setOutput("");
    setStreaming(true);

    const ac = new AbortController();
    abortRef.current = ac;

    try {
      await runDmTurn(
        [{ role: "user", content: text }],
        {
          store: snapshot,
          onChunk: (c) => setOutput((prev) => prev + c),
          signal: ac.signal,
        },
      );
    } catch (e) {
      if (ac.signal.aborted) {
        // 用户主动中断，不当作错误。
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
          喵～酒馆门还没推开，史莱姆已经在啃桌腿了。先把 LLM 接通，咱们再开团。
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
          <span className="font-mono text-stone-500">M2 沙盒</span>
        </div>

        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="输入一句话试试，例如：自我介绍一下你扮演的猫娘 DM Nyaa。"
          rows={3}
          className="w-full px-4 py-3 rounded-xl bg-black/30 border border-white/10 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/30 outline-none transition-all resize-y font-sans text-sm"
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
              e.preventDefault();
              handleSend();
            }
          }}
        />

        <div className="flex items-center justify-between gap-2">
          <span className="text-[11px] text-stone-500">
            Ctrl/Cmd + Enter 发送
          </span>
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
        client boot ok · M2 LLM 沙盒就绪 · 等待 M3 MCP 接入
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
