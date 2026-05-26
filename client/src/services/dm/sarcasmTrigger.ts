/**
 * Nyaa 元吐槽队列。订阅 `gameEvents`，把"值得吐槽的瞬间"翻译成
 * 排队等待 DM 在下一回合自然带出的一段提示文字（**给 LLM 看的种子**，
 * 不是直接渲染给玩家的文案）。
 *
 * 设计映射来自 KoPP2 §4 StatsCenter，但语义重写：
 * - KoPP2 是事件计数器驱动事件式技能（"挨打 N 次触发反击"）
 * - 我们这里只用计数器逻辑攒"DM 想吐槽的素材"，由下一回合 user content
 *   注入种子，LLM 自由演绎；**绝不**写死吐槽文本（会变成机翻味）
 *
 * M4 阶段先实装 3 类：
 * 1. 连续 ≥2 次 d20 自然 1   → "连续大失败"
 * 2. d20 自然 20             → "暴击演出"
 * 3. dm-parse-warning（dev） → "DM 走神"
 *
 * 队列模型：FIFO，每项含 kind / payload / ts；`drainSarcasmQueue()`
 * 一次取空。`installSarcasmTriggers()` 全局调一次（main.tsx 里）。
 */
import { gameEvents } from "../events/gameEvents";

export type SarcasmKind =
  | "consecutive-fumble"
  | "natural-twenty"
  | "dm-distracted";

export interface SarcasmItem {
  kind: SarcasmKind;
  /** 自然语种子（中文短句），LLM 自由演绎；**不**包标点强约束。 */
  seed: string;
  ts: number;
}

interface TriggerState {
  consecutiveFumbles: number;
  installed: boolean;
  /** 仅在 dev 模式下让 parse-warning 进队列；prod 静默。 */
  acceptParseWarning: boolean;
}

const queue: SarcasmItem[] = [];
const state: TriggerState = {
  consecutiveFumbles: 0,
  installed: false,
  acceptParseWarning: false,
};

/**
 * 全局只装一次。重复调用幂等（仅第一次生效）。`acceptParseWarning`
 * 受 `import.meta.env.DEV` 控制，避免 prod 玩家被频繁 meta 吐槽打断。
 */
export function installSarcasmTriggers(opts?: {
  acceptParseWarning?: boolean;
}): void {
  if (state.installed) return;
  state.installed = true;
  state.acceptParseWarning =
    opts?.acceptParseWarning ?? readDevFlag();

  gameEvents.on("dice-rolled", ({ isCritical, isFumble }) => {
    if (isFumble) {
      state.consecutiveFumbles += 1;
      if (state.consecutiveFumbles >= 2) {
        queue.push({
          kind: "consecutive-fumble",
          seed: `玩家在最近 ${state.consecutiveFumbles} 次掷骰里都翻出了自然 1，气氛凝固到能听见骰子在嘲笑。`,
          ts: Date.now(),
        });
      }
    } else {
      state.consecutiveFumbles = 0;
    }

    if (isCritical) {
      queue.push({
        kind: "natural-twenty",
        seed: "玩家刚刚掷出自然 20，全场屏息——给这一记暴击一个仪式感的演出，不要平淡过场。",
        ts: Date.now(),
      });
    }
  });

  gameEvents.on("dm-parse-warning", ({ warnings }) => {
    if (!state.acceptParseWarning || warnings.length === 0) return;
    const summary = warnings
      .slice(0, 3)
      .map((w) => w.kind)
      .join(" / ");
    queue.push({
      kind: "dm-distracted",
      seed: `DM 上一回合的输出有结构问题（${summary}），用一句俏皮的"刚才走神了"自嘲一下，然后立刻把节奏拉回来。`,
      ts: Date.now(),
    });
  });
}

/** 一次取空当前队列。SceneRunner 在每回合开头调一次。 */
export function drainSarcasmQueue(): SarcasmItem[] {
  const out = queue.splice(0, queue.length);
  return out;
}

/** 测试 / 切场景时手动重置内部状态。 */
export function _resetSarcasmTriggersForTest(): void {
  queue.length = 0;
  state.consecutiveFumbles = 0;
  state.installed = false;
  state.acceptParseWarning = false;
  gameEvents.all.clear();
}

/**
 * 仅在浏览器/Vite 环境读 `import.meta.env.DEV`；Node 测试环境拿不到
 * 就回落到 false。包一层避免在没有 vite/client 类型时 tsc 报错。
 */
function readDevFlag(): boolean {
  const env = (import.meta as { env?: { DEV?: boolean } }).env;
  return env?.DEV ?? false;
}
