import { Typewriter } from "./Typewriter";
import { getExpressionDisplay } from "../engine/dmExpressionMap";
import type { SceneBlocks } from "../engine/parseSceneBlocks";

/**
 * 历史回合卡片列表。每条 SceneBlocks 渲染成一张卡片：
 *   - 顶部 Nyaa "精灵"占位（M4 用大字号 emoji + 中文 label）
 *   - DM_VISUAL.description 作镜头描述（小字、灰）
 *   - DIALOGUE 行作 chat-bubble 列表
 *   - 仅最新一条用流式 Typewriter；旧卡 instant 模式
 *
 * `streamingDescription` 是当前回合**还没解析完**时的临时 raw 文本——
 * SceneRunner 流式收到 chunk 时会把累计 raw 传过来；解析完成后变 null，
 * 列表里就直接渲染对应 SceneBlocks 卡片。
 */
interface DialogueLogProps {
  /** 已经解析完毕的历史回合（含当前回合，如果当前回合已解析）。 */
  history: SceneBlocks[];
  /** 当前流式中的临时 raw 文本；解析完成后设为 null。 */
  streamingRaw?: string | null;
}

export function DialogueLog({ history, streamingRaw }: DialogueLogProps) {
  if (history.length === 0 && !streamingRaw) {
    return (
      <div className="text-xs text-stone-500 px-2 py-3 italic">
        还没开场。试试输入一句话或点示例 demo。
      </div>
    );
  }

  return (
    <ul className="space-y-3 list-none">
      {history.map((scene, idx) => (
        <SceneCard
          key={idx}
          scene={scene}
          isLatest={idx === history.length - 1 && !streamingRaw}
        />
      ))}
      {streamingRaw && <StreamingRawCard raw={streamingRaw} />}
    </ul>
  );
}

function SceneCard({
  scene,
  isLatest,
}: {
  scene: SceneBlocks;
  isLatest: boolean;
}) {
  const display = getExpressionDisplay(scene.dmVisual.expression);
  return (
    <li className="rounded-2xl bg-black/30 border border-white/10 p-4 space-y-3">
      <div className="flex items-start gap-3">
        <NyaaSprite emoji={display.emoji} label={display.label} />
        <div className="flex-1 min-w-0">
          {scene.dmVisual.description && (
            <Typewriter
              text={scene.dmVisual.description}
              instant={!isLatest}
              className="text-sm text-stone-300 leading-relaxed whitespace-pre-wrap"
            />
          )}
        </div>
      </div>
      {scene.dialogue.length > 0 && (
        <ul className="space-y-1.5 list-none pl-1">
          {scene.dialogue.map((line, i) => (
            <DialogueRow
              key={i}
              speaker={line.speaker}
              text={line.text}
              instant={!isLatest}
            />
          ))}
        </ul>
      )}
    </li>
  );
}

function NyaaSprite({ emoji, label }: { emoji: string; label: string }) {
  return (
    <div className="flex flex-col items-center w-14 flex-shrink-0">
      <div
        className="w-12 h-12 rounded-xl bg-gradient-to-br from-indigo-500/20 to-stone-800/40 border border-white/10 flex items-center justify-center text-3xl"
        aria-label={`Nyaa ${label}`}
        title={label}
      >
        {emoji}
      </div>
      <span className="text-[10px] text-stone-500 mt-1">{label}</span>
    </div>
  );
}

function DialogueRow({
  speaker,
  text,
  instant,
}: {
  speaker: string;
  text: string;
  instant: boolean;
}) {
  const isNarration = speaker === "旁白";
  if (isNarration) {
    return (
      <li className="text-xs text-stone-400 italic px-2">
        <Typewriter text={`* ${text} *`} instant={instant} />
      </li>
    );
  }
  return (
    <li className="text-sm">
      <span className="font-medium text-indigo-200 mr-2">{speaker}:</span>
      <Typewriter
        text={text}
        instant={instant}
        className="text-stone-100"
      />
    </li>
  );
}

function StreamingRawCard({ raw }: { raw: string }) {
  return (
    <li className="rounded-2xl bg-black/40 border border-indigo-400/30 p-4">
      <div className="flex items-center gap-2 text-[11px] text-indigo-300 mb-2">
        <span className="inline-block w-1.5 h-1.5 rounded-full bg-indigo-300 animate-pulse" />
        Nyaa 正在斟酌…（DSL 流式中）
      </div>
      <pre className="text-[11px] text-stone-400 whitespace-pre-wrap break-all font-mono max-h-48 overflow-y-auto">
        {raw}
      </pre>
    </li>
  );
}
