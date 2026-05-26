import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  _resetSarcasmTriggersForTest,
  drainSarcasmQueue,
  installSarcasmTriggers,
  type SarcasmItem,
} from "../sarcasmTrigger";
import { gameEvents } from "../../events/gameEvents";

beforeEach(() => {
  _resetSarcasmTriggersForTest();
});

afterEach(() => {
  _resetSarcasmTriggersForTest();
});

describe("sarcasmTrigger", () => {
  it("queues consecutive-fumble after two natural-1 in a row", () => {
    installSarcasmTriggers();
    gameEvents.emit("dice-rolled", {
      tool: "roll_dnd",
      args: {},
      finalValue: 4,
      isCritical: false,
      isFumble: true,
    });
    expect(drainSarcasmQueue()).toEqual([]); // 1 次还不算"连续"
    gameEvents.emit("dice-rolled", {
      tool: "roll_dnd",
      args: {},
      finalValue: 5,
      isCritical: false,
      isFumble: true,
    });
    const drained = drainSarcasmQueue();
    expect(drained).toHaveLength(1);
    expect(drained[0]?.kind).toBe<SarcasmItem["kind"]>("consecutive-fumble");
  });

  it("resets fumble streak when a non-fumble roll lands between", () => {
    installSarcasmTriggers();
    gameEvents.emit("dice-rolled", {
      tool: "roll_dnd",
      args: {},
      finalValue: 4,
      isCritical: false,
      isFumble: true,
    });
    gameEvents.emit("dice-rolled", {
      tool: "roll_dnd",
      args: {},
      finalValue: 14,
      isCritical: false,
      isFumble: false,
    });
    gameEvents.emit("dice-rolled", {
      tool: "roll_dnd",
      args: {},
      finalValue: 3,
      isCritical: false,
      isFumble: true,
    });
    expect(drainSarcasmQueue()).toEqual([]);
  });

  it("queues natural-twenty on critical", () => {
    installSarcasmTriggers();
    gameEvents.emit("dice-rolled", {
      tool: "roll_dnd",
      args: {},
      finalValue: 25,
      isCritical: true,
      isFumble: false,
    });
    const drained = drainSarcasmQueue();
    expect(drained).toHaveLength(1);
    expect(drained[0]?.kind).toBe("natural-twenty");
  });

  it("ignores parse-warning when acceptParseWarning is false", () => {
    installSarcasmTriggers({ acceptParseWarning: false });
    gameEvents.emit("dm-parse-warning", {
      warnings: [{ kind: "missing-block", block: "DM_VISUAL" }],
    });
    expect(drainSarcasmQueue()).toEqual([]);
  });

  it("queues dm-distracted when acceptParseWarning is true", () => {
    installSarcasmTriggers({ acceptParseWarning: true });
    gameEvents.emit("dm-parse-warning", {
      warnings: [
        { kind: "missing-block", block: "DM_VISUAL" },
        { kind: "invalid-expression", value: "dancing" },
      ],
    });
    const drained = drainSarcasmQueue();
    expect(drained).toHaveLength(1);
    expect(drained[0]?.kind).toBe("dm-distracted");
    expect(drained[0]?.seed).toContain("missing-block");
  });

  it("install is idempotent (calling twice does not double-fire)", () => {
    installSarcasmTriggers();
    installSarcasmTriggers();
    gameEvents.emit("dice-rolled", {
      tool: "roll_dnd",
      args: {},
      finalValue: 25,
      isCritical: true,
      isFumble: false,
    });
    expect(drainSarcasmQueue()).toHaveLength(1);
  });

  it("drainSarcasmQueue empties the queue", () => {
    installSarcasmTriggers();
    gameEvents.emit("dice-rolled", {
      tool: "roll_dnd",
      args: {},
      finalValue: 25,
      isCritical: true,
      isFumble: false,
    });
    expect(drainSarcasmQueue()).toHaveLength(1);
    expect(drainSarcasmQueue()).toEqual([]);
  });
});
