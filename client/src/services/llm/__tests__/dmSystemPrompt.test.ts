import { describe, expect, it } from "vitest";
import { buildDmSystemPrompt } from "../dmSystemPrompt";
import { assembleMcpRules } from "../mcpRules";
import type { SarcasmItem } from "../../dm/sarcasmTrigger";

const NO_SARCASM: SarcasmItem[] = [];
const ONE_SARCASM: SarcasmItem[] = [
  {
    kind: "natural-twenty",
    seed: "玩家刚刚掷出自然 20，给暴击一个仪式感演出。",
    ts: 1700000000000,
  },
];

describe("buildDmSystemPrompt", () => {
  it("includes persona and DSL contract every time", () => {
    const out = buildDmSystemPrompt({
      mcpRules: null,
      pendingSarcasm: NO_SARCASM,
    });
    expect(out).toContain("Nyaa");
    expect(out).toContain("猫娘 DM");
    expect(out).toContain("[DM_VISUAL]");
    expect(out).toContain("[DIALOGUE]");
    expect(out).toContain("[GAME_STATE]");
    expect(out).toContain("[ACTION_PROMPT]");
    expect(out).toContain("expression");
    expect(out).toContain("default | eye-roll");
  });

  it("appends MCP rules when provided", () => {
    const mcp = assembleMcpRules(["roll_dnd"]);
    expect(mcp).not.toBeNull();
    const out = buildDmSystemPrompt({
      mcpRules: mcp,
      pendingSarcasm: NO_SARCASM,
    });
    expect(out).toContain("MCP 工具使用准则");
    expect(out).toContain("roll_dnd");
  });

  it("omits MCP section when mcpRules is null", () => {
    const out = buildDmSystemPrompt({
      mcpRules: null,
      pendingSarcasm: NO_SARCASM,
    });
    expect(out).not.toContain("MCP 工具使用准则");
  });

  it("appends sarcasm seeds when queue is non-empty", () => {
    const out = buildDmSystemPrompt({
      mcpRules: null,
      pendingSarcasm: ONE_SARCASM,
    });
    expect(out).toContain("桌面氛围");
    expect(out).toContain("自然 20");
  });

  it("omits sarcasm section when queue is empty", () => {
    const out = buildDmSystemPrompt({
      mcpRules: null,
      pendingSarcasm: NO_SARCASM,
    });
    expect(out).not.toContain("桌面氛围");
  });

  it("combines all four sections in one shot", () => {
    const mcp = assembleMcpRules(["roll_dnd"]);
    const out = buildDmSystemPrompt({
      mcpRules: mcp,
      pendingSarcasm: ONE_SARCASM,
    });
    expect(out).toContain("Nyaa");
    expect(out).toContain("[DM_VISUAL]");
    expect(out).toContain("MCP 工具使用准则");
    expect(out).toContain("桌面氛围");
  });
});
