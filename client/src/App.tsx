import { useEffect, useMemo, useRef, useState } from "react";
import { Dice5, FileCode2, Settings2, Square } from "lucide-react";
import { APP_NAME, APP_VERSION, BLESSING } from "./version.ts";
import { LlmSettingsModal } from "./components/LlmSettingsModal";
import { DiceRoller } from "./components/DiceRoller";
import { DialogueLog } from "./components/DialogueLog";
import { ChoicePanel, type ChoicePanelSubmit } from "./components/ChoicePanel";
import {
  loadLlmSettings,
  saveLlmSettings,
  type LlmSettingsSnapshot,
} from "./services/llm/storage";
import { ApiHttpError, type ToolEvent } from "./services/llm/api";
import {
  buildDiceToolUseOptions,
  DICE_TOOL_NAMES,
  extractFinalRollValue,
} from "./services/mcp/diceTools";
import { gameEvents } from "./services/events/gameEvents";
import {
  parseSceneBlocks,
  type ParseWarning,
  type SceneBlocks,
} from "./engine/parseSceneBlocks";
import { SceneRunner } from "./engine/SceneRunner";

/**
 * M4 沙盒：顶部 Tab 切换两种调试形态——
 *   - **LLM 沙盒**：用真 LLM 跑 SceneRunner.runTurn，DialogueLog +
 *     ChoicePanel + DiceRoller 三处联动；keep M3 的"力量检定 demo"。
 *   - **手输 DSL**：左边 textarea 粘贴四块 DSL，右边实时显示
 *     parseSceneBlocks 输出的 JSON / warnings / 渲染后的 UI 预览。
 *
 * M5 上线像素精灵后整个 NyaaSprite 占位会替换；现在用 emoji。
 */
const STRENGTH_DEMO_PROMPT =
  "请扮演 DM 猫娘 Nyaa，让玩家做一次力量检定（DC 15）撬开一扇生锈的铁门。" +
  "记得先调用 roll_dnd 拿到真随机骰值，再依据成败叙事化展开。";

const HANDWRITE_SAMPLE = [
  "[DM_VISUAL]",
  "expression: smug",
  "Nyaa 用尾巴尖把骰子从桌沿拨下去，溅起一圈酒馆里灰扑扑的木屑。",
  "",
  "[DIALOGUE]",
  "Nyaa: 喵——这扇生锈的铁门怕是早就想退休了。",
  "玩家: 我要试试撬开它。",
  "*铁门发出不情愿的呻吟*",
  "",
  "[GAME_STATE]",
  "location: 边境酒馆门口",
  "turn: 3",
  "active_quest: 史莱姆讨伐",
  "table_event: 外卖刚到，玩家把骰子蹭到了甜甜圈上",
  "",
  "[ACTION_PROMPT]",
  "type: choices",
  "1. 用力撬门 (DC 15 力量检定)",
  "2. 找钥匙 (调查地面)",
  "3. 退一步, 我要换一个角色",
  "4. 自由发挥",
].join("\n");

type Tab = "llm" | "handwrite";

export default function App() {
  const [snapshot, setSnapshot] = useState<LlmSettingsSnapshot>(() =>
    loadLlmSettings(),
  );
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [tab, setTab] = useState<Tab>("llm");

  const handleSaveSnapshot = (next: LlmSettingsSnapshot) => {
    setSnapshot(next);
    saveLlmSettings(next);
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

      <nav className="flex items-center gap-1 p-1 rounded-2xl bg-white/5 border border-white/10">
        <TabButton
          active={tab === "llm"}
          onClick={() => setTab("llm")}
          icon={<Dice5 size={14} />}
          label="LLM 四块沙盒"
        />
        <TabButton
          active={tab === "handwrite"}
          onClick={() => setTab("handwrite")}
          icon={<FileCode2 size={14} />}
          label="手输 DSL 解析"
        />
      </nav>

      {tab === "llm" ? (
        <LlmSandbox
          snapshot={snapshot}
          activeProviderName={activeProvider?.name || ""}
          activeModel={activeModel}
        />
      ) : (
        <HandwriteSandbox />
      )}

      <footer className="mt-2 text-xs text-stone-500 font-mono">
        client boot ok · M4 DSL 引擎沙盒 · {BLESSING}
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

function TabButton({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm transition-all ${
        active
          ? "bg-indigo-500 text-white shadow-sm"
          : "text-stone-300 hover:bg-white/5"
      }`}
    >
      {icon}
      {label}
    </button>
  );
}
interface ToolLogEntry {
  id: string;
  round: number;
  name: string;
  args: Record<string, unknown>;
  ok: boolean;
  text: string;
}

function LlmSandbox({
  snapshot,
  activeProviderName,
  activeModel,
}: {
  snapshot: LlmSettingsSnapshot;
  activeProviderName: string;
  activeModel: string;
}) {
  const [history, setHistory] = useState<SceneBlocks[]>([]);
  const [streamingRaw, setStreamingRaw] = useState<string | null>(null);
  const [latestPrompt, setLatestPrompt] = useState<SceneBlocks["actionPrompt"]>({
    kind: "free-text",
    placeholder: "你想对 Nyaa 说什么？比如 “开始一场撬门冒险”。",
  });
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<ParseWarning[]>([]);
  const [mcpEnabled, setMcpEnabled] = useState(true);

  const [toolLog, setToolLog] = useState<ToolLogEntry[]>([]);
  const [diceRolling, setDiceRolling] = useState(false);
  const [diceFinal, setDiceFinal] = useState<number | undefined>(undefined);

  const abortRef = useRef<AbortController | null>(null);
  const diceTimerRef = useRef<number | null>(null);
  const runnerRef = useRef<SceneRunner | null>(null);

  if (!runnerRef.current) {
    runnerRef.current = new SceneRunner({ store: snapshot });
  }

  // dice-rolled 事件 → DiceRoller 翻面 + 定格。SceneRunner / diceTools
  // 都不直接 setState；统一通过 gameEvents 联动。
  useEffect(() => {
    const handler = (p: { finalValue: number }) => {
      setDiceFinal(undefined);
      setDiceRolling(true);
      if (diceTimerRef.current !== null) {
        window.clearTimeout(diceTimerRef.current);
      }
      diceTimerRef.current = window.setTimeout(() => {
        setDiceFinal(p.finalValue);
        setDiceRolling(false);
        diceTimerRef.current = null;
      }, 600);
    };
    gameEvents.on("dice-rolled", handler);
    return () => {
      gameEvents.off("dice-rolled", handler);
    };
  }, []);

  useEffect(
    () => () => {
      abortRef.current?.abort();
      if (diceTimerRef.current !== null) {
        window.clearTimeout(diceTimerRef.current);
      }
    },
    [],
  );

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
        const isCritical = finalValue >= 20;
        const isFumble = /\*\*1\*\*|自然 1|natural 1/i.test(ev.result.text);
        gameEvents.emit("dice-rolled", {
          tool: ev.name,
          args: ev.args,
          finalValue,
          isCritical,
          isFumble,
        });
      }
    }
  };

  const submitTurn = async (text: string) => {
    if (streaming) return;
    setError(null);
    setStreamingRaw("");
    setStreaming(true);
    setToolLog([]);

    const ac = new AbortController();
    abortRef.current = ac;

    try {
      const toolUseOptions = mcpEnabled
        ? await buildDiceToolUseOptions({
            signal: ac.signal,
            onToolEvent: handleToolEvent,
          })
        : null;

      const runner = runnerRef.current!;
      const result = await runner.runTurn({
        playerInput: text,
        signal: ac.signal,
        ...(toolUseOptions !== null && { toolUseOptions }),
        onChunk: (raw) => setStreamingRaw(raw),
      });

      setHistory([...runner.getHistory()]);
      setLatestPrompt(result.scene.actionPrompt);
      setWarnings(result.warnings);
      setStreamingRaw(null);
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
      setStreamingRaw(null);
    } finally {
      setStreaming(false);
      abortRef.current = null;
    }
  };

  const handleStop = () => abortRef.current?.abort();

  const handlePanelSubmit = (payload: ChoicePanelSubmit) => {
    if (payload.kind === "choice") {
      gameEvents.emit("choice-picked", {
        choiceId: payload.id,
        label: payload.label,
      });
      void submitTurn(`我选择 ${payload.id}. ${payload.label}`);
    } else if (payload.kind === "free-text") {
      gameEvents.emit("free-text-submitted", {
        text: payload.text,
        charCount: payload.text.length,
      });
      void submitTurn(payload.text);
    } else {
      void submitTurn("（玩家示意 Nyaa 继续叙事）");
    }
  };

  const handleStrengthDemo = () => {
    void submitTurn(STRENGTH_DEMO_PROMPT);
  };

  const handleReset = () => {
    runnerRef.current?.resetHistory();
    setHistory([]);
    setStreamingRaw(null);
    setWarnings([]);
    setToolLog([]);
    setDiceFinal(undefined);
    setDiceRolling(false);
    setLatestPrompt({
      kind: "free-text",
      placeholder: "你想对 Nyaa 说什么？比如 “开始一场撬门冒险”。",
    });
  };

  return (
    <section className="w-full max-w-3xl space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-xs text-stone-400">
        <span>
          当前：
          <span className="text-stone-200 font-mono ml-1">
            {activeProviderName || "（未选 Provider）"}
          </span>
          {activeModel && (
            <span className="ml-2 text-stone-500 font-mono">
              / {activeModel}
            </span>
          )}
        </span>
        <div className="flex items-center gap-3">
          <label className="inline-flex items-center gap-1.5 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={mcpEnabled}
              onChange={(e) => setMcpEnabled(e.target.checked)}
              className="w-3.5 h-3.5 accent-indigo-400"
            />
            MCP 骰子
          </label>
          <button
            type="button"
            onClick={handleReset}
            disabled={streaming || history.length === 0}
            className="px-2 py-1 rounded-lg bg-white/5 hover:bg-white/10 disabled:opacity-40 disabled:cursor-not-allowed border border-white/10"
          >
            重开
          </button>
        </div>
      </div>

      <div className="rounded-2xl bg-white/[0.02] border border-white/10 p-4 max-h-[50vh] overflow-y-auto">
        <DialogueLog history={history} streamingRaw={streamingRaw} />
      </div>

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

      <ChoicePanel
        prompt={latestPrompt}
        disabled={streaming}
        onSubmit={handlePanelSubmit}
      />

      <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-stone-500">
        <button
          type="button"
          onClick={handleStrengthDemo}
          disabled={streaming}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500/15 hover:bg-amber-500/25 disabled:opacity-50 disabled:cursor-not-allowed border border-amber-400/30 text-amber-200"
        >
          <Dice5 size={13} />
          力量检定 demo
        </button>
        {streaming && (
          <button
            type="button"
            onClick={handleStop}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-500/20 hover:bg-red-500/30 border border-red-400/30 text-red-200"
          >
            <Square size={13} />
            停止
          </button>
        )}
      </div>

      {error && (
        <div className="text-xs text-red-300 bg-red-500/10 border border-red-400/20 rounded-xl px-3 py-2 break-all">
          {error}
        </div>
      )}

      {warnings.length > 0 && <WarningsPanel warnings={warnings} />}

      {toolLog.length > 0 && <ToolLogPanel entries={toolLog} />}
    </section>
  );
}
function HandwriteSandbox() {
  const [text, setText] = useState(HANDWRITE_SAMPLE);

  const { scene, warnings } = useMemo(() => parseSceneBlocks(text), [text]);
  const history: SceneBlocks[] = scene
    ? [scene]
    : [];

  return (
    <section className="w-full max-w-6xl grid grid-cols-1 lg:grid-cols-2 gap-4">
      <div className="space-y-2">
        <h3 className="text-sm text-stone-300 font-medium px-1">
          四块 DSL 输入
        </h3>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          spellCheck={false}
          className="w-full h-[60vh] px-4 py-3 rounded-2xl bg-black/40 border border-white/10 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/30 outline-none transition-all resize-none font-mono text-xs text-stone-100"
        />
        <p className="text-[11px] text-stone-500 px-1">
          粘贴或编辑四块文本——解析器实时跑，右侧立刻预览解析结果与 UI。
        </p>
      </div>
      <div className="space-y-3">
        <h3 className="text-sm text-stone-300 font-medium px-1">
          UI 预览
        </h3>
        <div className="rounded-2xl bg-white/[0.02] border border-white/10 p-4 max-h-[40vh] overflow-y-auto">
          <DialogueLog history={history} streamingRaw={null} />
        </div>
        <ChoicePanel
          prompt={scene.actionPrompt}
          disabled={false}
          onSubmit={() => {}}
        />
        {warnings.length > 0 && <WarningsPanel warnings={warnings} />}
        <details className="rounded-xl bg-black/30 border border-white/10 text-xs">
          <summary className="px-3 py-2 cursor-pointer text-stone-300 select-none">
            解析结果 JSON
          </summary>
          <pre className="px-3 pb-3 text-[11px] text-stone-400 whitespace-pre-wrap break-all font-mono max-h-72 overflow-y-auto">
            {JSON.stringify({ scene, warnings }, null, 2)}
          </pre>
        </details>
      </div>
    </section>
  );
}

function WarningsPanel({ warnings }: { warnings: ParseWarning[] }) {
  return (
    <details
      open
      className="rounded-xl bg-amber-500/5 border border-amber-400/20 text-xs"
    >
      <summary className="px-3 py-2 cursor-pointer text-amber-200 select-none">
        解析警告 ({warnings.length})
      </summary>
      <ul className="px-3 pb-3 space-y-1 list-none">
        {warnings.map((w, i) => (
          <li key={i} className="text-amber-100/90 font-mono text-[11px]">
            <span className="text-amber-400 mr-2">•</span>
            {formatWarning(w)}
          </li>
        ))}
      </ul>
    </details>
  );
}

function formatWarning(w: ParseWarning): string {
  switch (w.kind) {
    case "missing-block":
      return `missing-block: ${w.block}`;
    case "missing-field":
      return `missing-field: ${w.path}`;
    case "unknown-block":
      return `unknown-block: ${w.block}`;
    case "empty-block":
      return `empty-block: ${w.block}`;
    case "invalid-expression":
      return `invalid-expression: "${w.value}"`;
    case "invalid-turn":
      return `invalid-turn: "${w.value}"`;
    case "dialogue-no-speaker":
      return `dialogue-no-speaker: "${truncate(w.line, 60)}"`;
    case "choice-no-id":
      return `choice-no-id: "${truncate(w.line, 60)}"`;
    case "too-many-choices":
      return `too-many-choices: ${w.count}（已截到前 4）`;
  }
}

function ToolLogPanel({ entries }: { entries: ToolLogEntry[] }) {
  return (
    <details
      open
      className="text-xs bg-black/20 border border-white/10 rounded-xl"
    >
      <summary className="px-3 py-2 cursor-pointer text-stone-300 select-none">
        工具调用日志 ({entries.length})
      </summary>
      <ul className="px-3 pb-3 space-y-2 list-none">
        {entries.map((entry) => (
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
                className={entry.ok ? "text-emerald-300" : "text-red-300"}
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
  );
}

function truncate(s: string, n: number): string {
  return s.length <= n ? s : s.slice(0, n) + "…";
}
