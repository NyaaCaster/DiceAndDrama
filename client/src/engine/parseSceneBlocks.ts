/**
 * Dice & Drama 四块 DSL 解析器。契约见 `.docs/dsl-spec.md`。
 *
 * 设计原则：缺块不致命——返回空字段 + warnings[]，UI 走优雅降级。
 * LLM 偶尔会乱序、漏块、塞额外段、打错 expression 名；解析器都吃下来。
 *
 * 双方括号转义：块内文本里的 `[[` / `]]` 在抽块阶段会被临时替换成
 *  / ，块切完再换回单括号，避免被误识别为段头。
 */
export type ExpressionKey =
  | "default"
  | "eye-roll"
  | "ear-twitch"
  | "donut"
  | "petting-cat"
  | "surprised"
  | "smug"
  | "sleepy";

const EXPRESSION_KEYS: ReadonlySet<ExpressionKey> = new Set<ExpressionKey>([
  "default",
  "eye-roll",
  "ear-twitch",
  "donut",
  "petting-cat",
  "surprised",
  "smug",
  "sleepy",
]);

export interface DialogueLine {
  speaker: string;
  text: string;
}

export interface DmVisual {
  expression: ExpressionKey;
  description: string;
}

export interface GameState {
  location: string;
  turn: number;
  activeQuest: string;
  tableEvent: string | null;
}

export interface Choice {
  id: string;
  label: string;
}

export type ActionPrompt =
  | { kind: "choices"; choices: Choice[] }
  | { kind: "free-text"; placeholder: string }
  | { kind: "none" };

export interface SceneBlocks {
  dmVisual: DmVisual;
  dialogue: DialogueLine[];
  gameState: GameState;
  actionPrompt: ActionPrompt;
}

export type ParseWarning =
  | { kind: "missing-block"; block: string }
  | { kind: "missing-field"; path: string }
  | { kind: "unknown-block"; block: string }
  | { kind: "empty-block"; block: string }
  | { kind: "invalid-expression"; value: string }
  | { kind: "invalid-turn"; value: string }
  | { kind: "dialogue-no-speaker"; line: string }
  | { kind: "choice-no-id"; line: string }
  | { kind: "too-many-choices"; count: number };

export interface ParseResult {
  scene: SceneBlocks;
  warnings: ParseWarning[];
}

const KNOWN_BLOCKS = new Set([
  "DM_VISUAL",
  "DIALOGUE",
  "GAME_STATE",
  "ACTION_PROMPT",
]);

const ESC_OPEN = "";
const ESC_CLOSE = "";

const BLOCK_HEADER_RE = /^\s*\[\s*([A-Za-z][A-Za-z_]*)\s*\]\s*$/;

interface RawBlocks {
  // 名字归一化为大写下划线，值是块体（无段头行）。
  [name: string]: string;
}

function escapeDoubleBrackets(s: string): string {
  return s.replace(/\[\[/g, ESC_OPEN).replace(/]]/g, ESC_CLOSE);
}

function unescapeDoubleBrackets(s: string): string {
  return s.replace(new RegExp(ESC_OPEN, "g"), "[").replace(
    new RegExp(ESC_CLOSE, "g"),
    "]",
  );
}

function normalizeNewlines(s: string): string {
  return s.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

/**
 * 第一遍：把整段 raw 切成 { BLOCK_NAME: body } 的 map。
 * 段头识别按正则 `^\s*\[\s*[A-Z_]+\s*\]\s*$`，大小写不敏感。
 * 双方括号在切块前已被转义为 ESC 字符，避免误识别。
 */
function splitBlocks(raw: string): {
  blocks: RawBlocks;
  unknownBlocks: string[];
  order: string[];
} {
  const lines = raw.split("\n");
  const blocks: RawBlocks = {};
  const unknownBlocks: string[] = [];
  const order: string[] = [];
  let currentName: string | null = null;
  let currentBody: string[] = [];

  const commit = () => {
    if (currentName === null) return;
    const body = unescapeDoubleBrackets(currentBody.join("\n")).trim();
    if (KNOWN_BLOCKS.has(currentName)) {
      blocks[currentName] = body;
      order.push(currentName);
    } else {
      unknownBlocks.push(currentName);
    }
  };

  for (const line of lines) {
    const m = line.match(BLOCK_HEADER_RE);
    if (m && m[1] !== undefined) {
      commit();
      currentName = m[1].toUpperCase();
      currentBody = [];
    } else if (currentName !== null) {
      currentBody.push(line);
    }
    // 段头之前的散文直接丢——LLM 偶尔会先吐一段开场白，本游戏不收。
  }
  commit();

  return { blocks, unknownBlocks, order };
}
function readKv(body: string): Map<string, string> {
  // 行级 key: value 抽取。同 key 后写覆盖前写。冒号支持中英文。
  // 不识别为 kv 的行被忽略——子解析器各自决定要不要把"剩下的散文"当
  // description / choice label。
  const kv = new Map<string, string>();
  for (const raw of body.split("\n")) {
    const m = raw.match(/^\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*[:：]\s*(.*?)\s*$/);
    if (m && m[1] !== undefined && m[2] !== undefined) {
      kv.set(m[1].toLowerCase(), m[2]);
    }
  }
  return kv;
}

function parseDmVisual(body: string | undefined, warnings: ParseWarning[]): DmVisual {
  if (body === undefined) {
    warnings.push({ kind: "missing-block", block: "DM_VISUAL" });
    return { expression: "default", description: "" };
  }
  const lines = body.split("\n");
  let expression: ExpressionKey = "default";
  let expressionFound = false;
  const descLines: string[] = [];

  for (const line of lines) {
    const m = line.match(/^\s*expression\s*[:：]\s*(.*?)\s*$/i);
    if (m && m[1] !== undefined && !expressionFound) {
      const value = m[1].trim();
      if (EXPRESSION_KEYS.has(value as ExpressionKey)) {
        expression = value as ExpressionKey;
      } else if (value !== "") {
        warnings.push({ kind: "invalid-expression", value });
      }
      expressionFound = true;
    } else {
      descLines.push(line);
    }
  }

  if (!expressionFound) {
    warnings.push({ kind: "missing-field", path: "dmVisual.expression" });
  }

  const description = descLines.join("\n").trim();
  if (description === "" && body.trim() === "") {
    warnings.push({ kind: "empty-block", block: "DM_VISUAL" });
  }
  return { expression, description };
}

function parseDialogue(body: string | undefined, warnings: ParseWarning[]): DialogueLine[] {
  if (body === undefined) {
    warnings.push({ kind: "missing-block", block: "DIALOGUE" });
    return [];
  }
  if (body.trim() === "") {
    warnings.push({ kind: "empty-block", block: "DIALOGUE" });
    return [];
  }
  const out: DialogueLine[] = [];
  for (const raw of body.split("\n")) {
    const line = raw.trim();
    if (line === "") continue;

    // 旁白：*文本*
    const narration = line.match(/^\*(.+)\*$/);
    if (narration && narration[1] !== undefined) {
      out.push({ speaker: "旁白", text: narration[1].trim() });
      continue;
    }

    // <speaker>: <text>，冒号中英文皆可
    const m = line.match(/^([^:：]{1,40})\s*[:：]\s*(.+)$/);
    if (m && m[1] !== undefined && m[2] !== undefined) {
      out.push({ speaker: m[1].trim(), text: m[2].trim() });
      continue;
    }

    warnings.push({ kind: "dialogue-no-speaker", line });
    out.push({ speaker: "Nyaa", text: line });
  }
  return out;
}

function parseGameState(body: string | undefined, warnings: ParseWarning[]): GameState {
  if (body === undefined) {
    warnings.push({ kind: "missing-block", block: "GAME_STATE" });
    return { location: "", turn: 0, activeQuest: "", tableEvent: null };
  }
  const kv = readKv(body);
  const location = kv.get("location") ?? "";
  const activeQuest = kv.get("active_quest") ?? "";

  let turn = 0;
  const turnRaw = kv.get("turn");
  if (turnRaw !== undefined) {
    const n = Number.parseInt(turnRaw, 10);
    if (Number.isFinite(n) && String(n) === turnRaw.trim()) {
      turn = n;
    } else {
      warnings.push({ kind: "invalid-turn", value: turnRaw });
    }
  }

  const teRaw = (kv.get("table_event") ?? "").trim();
  const tableEvent =
    teRaw === "" || teRaw === "-" || teRaw.toLowerCase() === "none"
      ? null
      : teRaw;

  return { location, turn, activeQuest, tableEvent };
}

function parseActionPrompt(
  body: string | undefined,
  warnings: ParseWarning[],
): ActionPrompt {
  if (body === undefined) {
    warnings.push({ kind: "missing-block", block: "ACTION_PROMPT" });
    return { kind: "none" };
  }

  const kv = readKv(body);
  const typeRaw = (kv.get("type") ?? "").trim().toLowerCase();
  // 把 type / placeholder 行从 body 里剔掉，剩下的当 choice 候选行。
  const remainingLines = body
    .split("\n")
    .filter((l) => !/^\s*(type|placeholder)\s*[:：]/i.test(l))
    .map((l) => l.trim())
    .filter((l) => l !== "");

  const tryChoices = (): Choice[] => {
    const choices: Choice[] = [];
    let auto = 1;
    for (const line of remainingLines) {
      const m = line.match(/^(\d+)\s*[\.、]\s*(.+)$/);
      if (m && m[1] !== undefined && m[2] !== undefined) {
        choices.push({ id: m[1], label: m[2].trim() });
      } else {
        warnings.push({ kind: "choice-no-id", line });
        choices.push({ id: String(auto), label: line });
      }
      auto += 1;
    }
    if (choices.length > 4) {
      warnings.push({ kind: "too-many-choices", count: choices.length });
      return choices.slice(0, 4);
    }
    return choices;
  };

  if (typeRaw === "choices") {
    return { kind: "choices", choices: tryChoices() };
  }
  if (typeRaw === "free-text") {
    return { kind: "free-text", placeholder: kv.get("placeholder") ?? "" };
  }
  if (typeRaw === "none") {
    return { kind: "none" };
  }

  // 缺 type 行：按内容启发式
  if (typeRaw === "") {
    warnings.push({ kind: "missing-field", path: "actionPrompt.type" });
  }
  if (kv.has("placeholder")) {
    return { kind: "free-text", placeholder: kv.get("placeholder") ?? "" };
  }
  if (remainingLines.length > 0) {
    return { kind: "choices", choices: tryChoices() };
  }
  return { kind: "none" };
}

export function parseSceneBlocks(raw: string): ParseResult {
  const warnings: ParseWarning[] = [];
  const normalized = escapeDoubleBrackets(normalizeNewlines(raw ?? ""));
  const { blocks, unknownBlocks } = splitBlocks(normalized);

  for (const name of unknownBlocks) {
    warnings.push({ kind: "unknown-block", block: name });
  }

  const scene: SceneBlocks = {
    dmVisual: parseDmVisual(blocks.DM_VISUAL, warnings),
    dialogue: parseDialogue(blocks.DIALOGUE, warnings),
    gameState: parseGameState(blocks.GAME_STATE, warnings),
    actionPrompt: parseActionPrompt(blocks.ACTION_PROMPT, warnings),
  };

  return { scene, warnings };
}

