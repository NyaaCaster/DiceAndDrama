import { describe, expect, it } from "vitest";
import { parseSceneBlocks } from "../parseSceneBlocks";

describe("parseSceneBlocks · happy path", () => {
  it("parses the canonical four-block sample end-to-end", () => {
    const raw = [
      "[DM_VISUAL]",
      "expression: smug",
      "铁门吱呀一声往后倒，灰尘簌簌落进玩家的领口。",
      "",
      "[DIALOGUE]",
      "Nyaa: 喵——这扇门怕是早就想退休了。",
      "玩家: 这下能进去了？",
      "*铁门发出不情愿的呻吟*",
      "",
      "[GAME_STATE]",
      "location: 边境酒馆地下室门口",
      "turn: 4",
      "active_quest: 史莱姆讨伐",
      "table_event: -",
      "",
      "[ACTION_PROMPT]",
      "type: choices",
      "1. 推门进入地下室",
      "2. 先看看门把手有没有陷阱",
      "3. 让 Nyaa 先丢骰决定要不要进",
      "4. 等等, 我先吃口甜甜圈",
    ].join("\n");

    const { scene, warnings } = parseSceneBlocks(raw);

    expect(warnings).toEqual([]);
    expect(scene.dmVisual.expression).toBe("smug");
    expect(scene.dmVisual.description).toContain("铁门吱呀");
    expect(scene.dialogue).toEqual([
      { speaker: "Nyaa", text: "喵——这扇门怕是早就想退休了。" },
      { speaker: "玩家", text: "这下能进去了？" },
      { speaker: "旁白", text: "铁门发出不情愿的呻吟" },
    ]);
    expect(scene.gameState).toEqual({
      location: "边境酒馆地下室门口",
      turn: 4,
      activeQuest: "史莱姆讨伐",
      tableEvent: null,
    });
    expect(scene.actionPrompt).toEqual({
      kind: "choices",
      choices: [
        { id: "1", label: "推门进入地下室" },
        { id: "2", label: "先看看门把手有没有陷阱" },
        { id: "3", label: "让 Nyaa 先丢骰决定要不要进" },
        { id: "4", label: "等等, 我先吃口甜甜圈" },
      ],
    });
  });
});
describe("parseSceneBlocks · missing block fallback", () => {
  it("returns empty defaults + missing-block warnings when blocks are absent", () => {
    const raw = "[DM_VISUAL]\nexpression: default\n仅一段画面。";
    const { scene, warnings } = parseSceneBlocks(raw);

    expect(scene.dmVisual.expression).toBe("default");
    expect(scene.dmVisual.description).toBe("仅一段画面。");
    expect(scene.dialogue).toEqual([]);
    expect(scene.gameState).toEqual({
      location: "",
      turn: 0,
      activeQuest: "",
      tableEvent: null,
    });
    expect(scene.actionPrompt).toEqual({ kind: "none" });

    const kinds = warnings.map((w) => w.kind);
    expect(kinds).toContain("missing-block");
    const missing = warnings.filter((w) => w.kind === "missing-block");
    expect(missing.map((w) => (w as { block: string }).block).sort()).toEqual([
      "ACTION_PROMPT",
      "DIALOGUE",
      "GAME_STATE",
    ]);
  });

  it("emits missing-field warning when DM_VISUAL has no expression line", () => {
    const raw = [
      "[DM_VISUAL]",
      "酒馆里没什么动静。",
      "[DIALOGUE]",
      "Nyaa: 喵。",
      "[GAME_STATE]",
      "turn: 1",
      "[ACTION_PROMPT]",
      "type: none",
    ].join("\n");
    const { scene, warnings } = parseSceneBlocks(raw);

    expect(scene.dmVisual.expression).toBe("default");
    expect(scene.dmVisual.description).toBe("酒馆里没什么动静。");
    expect(
      warnings.some(
        (w) =>
          w.kind === "missing-field" && w.path === "dmVisual.expression",
      ),
    ).toBe(true);
  });

  it("emits invalid-expression warning and falls back to default", () => {
    const raw = [
      "[DM_VISUAL]",
      "expression: dancing",
      "Nyaa 在跳舞。",
      "[DIALOGUE]",
      "Nyaa: 喵。",
      "[GAME_STATE]",
      "turn: 1",
      "[ACTION_PROMPT]",
      "type: none",
    ].join("\n");
    const { scene, warnings } = parseSceneBlocks(raw);

    expect(scene.dmVisual.expression).toBe("default");
    expect(
      warnings.some(
        (w) => w.kind === "invalid-expression" && w.value === "dancing",
      ),
    ).toBe(true);
  });
});
describe("parseSceneBlocks · unknown / extra blocks", () => {
  it("drops unknown blocks and records unknown-block warning", () => {
    const raw = [
      "[META]",
      "internal: ignored",
      "[DM_VISUAL]",
      "expression: default",
      "正常画面。",
      "[DIALOGUE]",
      "Nyaa: 喵。",
      "[GAME_STATE]",
      "turn: 1",
      "[ACTION_PROMPT]",
      "type: none",
      "[INTERNAL]",
      "也忽略。",
    ].join("\n");
    const { scene, warnings } = parseSceneBlocks(raw);

    expect(scene.dmVisual.description).toBe("正常画面。");
    const unknown = warnings.filter((w) => w.kind === "unknown-block");
    expect(unknown.map((w) => (w as { block: string }).block).sort()).toEqual([
      "INTERNAL",
      "META",
    ]);
  });

  it("ignores prose before the first block header", () => {
    const raw = [
      "Nyaa 走神了，先嘀咕一句然后才进入正题。",
      "[DM_VISUAL]",
      "expression: default",
      "镜头拉开。",
      "[DIALOGUE]",
      "Nyaa: 喵。",
      "[GAME_STATE]",
      "turn: 1",
      "[ACTION_PROMPT]",
      "type: none",
    ].join("\n");
    const { scene } = parseSceneBlocks(raw);
    expect(scene.dmVisual.description).toBe("镜头拉开。");
  });

  it("accepts case-insensitive headers and weird whitespace", () => {
    const raw = [
      "[ dm_visual ]",
      "expression: smug",
      "得意。",
      "[Dialogue]",
      "Nyaa: 喵。",
      "[GAME_STATE]",
      "turn: 2",
      "[ ACTION_PROMPT ]",
      "type: none",
    ].join("\n");
    const { scene, warnings } = parseSceneBlocks(raw);
    expect(warnings).toEqual([]);
    expect(scene.dmVisual.expression).toBe("smug");
    expect(scene.gameState.turn).toBe(2);
    expect(scene.actionPrompt).toEqual({ kind: "none" });
  });
});
describe("parseSceneBlocks · escape, newlines, punctuation", () => {
  it("preserves [[bracket]] escapes inside block bodies", () => {
    const raw = [
      "[DM_VISUAL]",
      "expression: default",
      "玩家看到墙上写着 [[警告]]：禁止携带 [[魔法]]。",
      "[DIALOGUE]",
      "Nyaa: 喵～注意 [[告示]]。",
      "[GAME_STATE]",
      "turn: 1",
      "[ACTION_PROMPT]",
      "type: none",
    ].join("\n");
    const { scene, warnings } = parseSceneBlocks(raw);

    expect(warnings).toEqual([]);
    expect(scene.dmVisual.description).toContain("[警告]");
    expect(scene.dmVisual.description).toContain("[魔法]");
    expect(scene.dialogue[0]).toEqual({
      speaker: "Nyaa",
      text: "喵～注意 [告示]。",
    });
  });

  it("normalizes CRLF and bare CR newlines", () => {
    const raw =
      "[DM_VISUAL]\r\nexpression: default\r\n第一行\r第二行\r\n[DIALOGUE]\r\nNyaa: 喵。\r\n[GAME_STATE]\r\nturn: 3\r\n[ACTION_PROMPT]\r\ntype: none\r\n";
    const { scene, warnings } = parseSceneBlocks(raw);

    expect(warnings).toEqual([]);
    expect(scene.dmVisual.description).toBe("第一行\n第二行");
    expect(scene.gameState.turn).toBe(3);
  });

  it("accepts Chinese full-width colon for kv and dialogue", () => {
    const raw = [
      "[DM_VISUAL]",
      "expression: default",
      "Nyaa 啜了口奶茶。",
      "[DIALOGUE]",
      "Nyaa：喵～你想做什么？",
      "玩家：我想睡觉。",
      "[GAME_STATE]",
      "location：边境酒馆",
      "turn：5",
      "active_quest：摸鱼",
      "table_event：none",
      "[ACTION_PROMPT]",
      "type：choices",
      "1、上楼睡觉",
      "2、再点一杯",
    ].join("\n");
    const { scene, warnings } = parseSceneBlocks(raw);

    expect(warnings).toEqual([]);
    expect(scene.dialogue).toEqual([
      { speaker: "Nyaa", text: "喵～你想做什么？" },
      { speaker: "玩家", text: "我想睡觉。" },
    ]);
    expect(scene.gameState).toEqual({
      location: "边境酒馆",
      turn: 5,
      activeQuest: "摸鱼",
      tableEvent: null,
    });
    expect(scene.actionPrompt).toEqual({
      kind: "choices",
      choices: [
        { id: "1", label: "上楼睡觉" },
        { id: "2", label: "再点一杯" },
      ],
    });
  });
});
describe("parseSceneBlocks · action prompt variants", () => {
  it("parses free-text with placeholder", () => {
    const raw = [
      "[DM_VISUAL]",
      "expression: default",
      "Nyaa 等你回应。",
      "[DIALOGUE]",
      "Nyaa: 你打算说什么？",
      "[GAME_STATE]",
      "turn: 1",
      "[ACTION_PROMPT]",
      "type: free-text",
      "placeholder: 描述你怎么做（30 字以内）",
    ].join("\n");
    const { scene, warnings } = parseSceneBlocks(raw);
    expect(warnings).toEqual([]);
    expect(scene.actionPrompt).toEqual({
      kind: "free-text",
      placeholder: "描述你怎么做（30 字以内）",
    });
  });

  it("clamps too-many-choices to 4 and emits warning", () => {
    const raw = [
      "[DM_VISUAL]",
      "expression: default",
      "选项过多。",
      "[DIALOGUE]",
      "Nyaa: 选吧。",
      "[GAME_STATE]",
      "turn: 1",
      "[ACTION_PROMPT]",
      "type: choices",
      "1. 一",
      "2. 二",
      "3. 三",
      "4. 四",
      "5. 五",
      "6. 六",
    ].join("\n");
    const { scene, warnings } = parseSceneBlocks(raw);
    if (scene.actionPrompt.kind !== "choices") {
      throw new Error("expected choices");
    }
    expect(scene.actionPrompt.choices).toHaveLength(4);
    expect(scene.actionPrompt.choices.map((c) => c.id)).toEqual([
      "1",
      "2",
      "3",
      "4",
    ]);
    expect(
      warnings.some(
        (w) => w.kind === "too-many-choices" && w.count === 6,
      ),
    ).toBe(true);
  });

  it("auto-detects choices when type is missing", () => {
    const raw = [
      "[DM_VISUAL]",
      "expression: default",
      "Nyaa 漏了 type 行。",
      "[DIALOGUE]",
      "Nyaa: 喵。",
      "[GAME_STATE]",
      "turn: 1",
      "[ACTION_PROMPT]",
      "1. 选项 A",
      "2. 选项 B",
    ].join("\n");
    const { scene, warnings } = parseSceneBlocks(raw);
    expect(scene.actionPrompt.kind).toBe("choices");
    expect(
      warnings.some(
        (w) =>
          w.kind === "missing-field" && w.path === "actionPrompt.type",
      ),
    ).toBe(true);
  });

  it("flags invalid turn integer", () => {
    const raw = [
      "[DM_VISUAL]",
      "expression: default",
      "回合数有问题。",
      "[DIALOGUE]",
      "Nyaa: 喵。",
      "[GAME_STATE]",
      "turn: 三",
      "[ACTION_PROMPT]",
      "type: none",
    ].join("\n");
    const { scene, warnings } = parseSceneBlocks(raw);
    expect(scene.gameState.turn).toBe(0);
    expect(
      warnings.some((w) => w.kind === "invalid-turn" && w.value === "三"),
    ).toBe(true);
  });

  it("flags dialogue line without speaker", () => {
    const raw = [
      "[DM_VISUAL]",
      "expression: default",
      "对白格式错误。",
      "[DIALOGUE]",
      "这一行没有冒号也没有星号",
      "[GAME_STATE]",
      "turn: 1",
      "[ACTION_PROMPT]",
      "type: none",
    ].join("\n");
    const { scene, warnings } = parseSceneBlocks(raw);
    expect(scene.dialogue).toEqual([
      { speaker: "Nyaa", text: "这一行没有冒号也没有星号" },
    ]);
    expect(
      warnings.some((w) => w.kind === "dialogue-no-speaker"),
    ).toBe(true);
  });
});

