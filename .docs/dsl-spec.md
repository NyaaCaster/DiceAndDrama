# Dice & Drama 四块 DSL 规范（v1）

> Nyaa 每轮回复必须严格输出四个 `[BLOCK_NAME]` 段，**顺序固定**，每段以下一个段头或文本结束为界。解析器 `client/src/engine/parseSceneBlocks.ts` 据此契约提取结构化数据驱动 UI。
>
> 这份契约对 LLM 是"输出格式约束"，对前端是"渲染契约"。改动需同步 `client/src/services/llm/dmSystemPrompt.ts` 的人格 + 契约段、`engine/parseSceneBlocks.ts` 的解析逻辑、本文档三处。

## 一、总体形状

```
[DM_VISUAL]
expression: <one of 8 keys>
<自由叙述：场景画面 / Nyaa 神情 / 镜头描述>

[DIALOGUE]
<speaker>: <一句话>
<speaker>: <一句话>
...

[GAME_STATE]
location: <场景/地名>
turn: <当前回合数，整数>
active_quest: <当前任务，可空>
table_event: <桌面事件，无则写 none 或 ->

[ACTION_PROMPT]
type: choices | free-text | none
<具体内容，见第六节>
```

四块**严格按上述顺序**给出。每块开头是 `[BLOCK_NAME]` 独立成行（行首方括号、行尾换行），下一块开头出现即视为前一块结束。

## 二、设计原则

1. **顺序固定**：`DM_VISUAL → DIALOGUE → GAME_STATE → ACTION_PROMPT`。LLM 即使本回合不需要某块也要给空块，不要乱序。
2. **缺块不致命**：解析器对缺块**不抛错**，而是产出空字段 + 记录 `warning("missing-block", ...)`，UI 走优雅降级（空表情、空对白、保持上一回合状态、回退到自由输入）。
3. **多余块忽略**：未知段头（如 `[META]` `[INTERNAL]`）会被丢弃 + 记录 `warning("unknown-block", ...)`。LLM 不应主动加块，但解析器不会因此崩。
4. **方括号转义**：块内文本如需出现方括号，写成 `[[` 与 `]]`（解析器把双括号还原为单括号），避免被误识别成块边界。
5. **大小写不敏感**：段头识别按 `^\s*\[\s*[A-Z_]+\s*\]\s*$` 模式匹配，`[dm_visual]` 与 `[ DM_VISUAL ]` 都接受；子字段键名统一小写下划线。
6. **行结尾**：解析器把 CRLF / CR 统一成 LF；首尾空白裁掉。

## 三、`[DM_VISUAL]` 块

驱动 Nyaa 表情精灵 + 镜头描述层。

**子字段**：
- `expression`（必需键，值是 8 种之一；未识别 → 记 warning，回退到 `default`）：
  - `default` 默认平静
  - `eye-roll` 翻白眼
  - `ear-twitch` 抽搐耳
  - `donut` 吃甜甜圈
  - `petting-cat` 撸猫
  - `surprised` 惊讶
  - `smug` 得意
  - `sleepy` 瞌睡
- `description`（必需，自由文本）：场景画面 / Nyaa 神情 / 镜头描述。可多行，至下一段头止。

**Happy 示例**：
```
[DM_VISUAL]
expression: smug
酒馆门吱呀一声裂开，史莱姆的胶质身体被门板带得歪了歪，溅起一坨绿水。Nyaa 用尾巴尖把骰子从桌沿拨下去，眯着眼笑。
```

**降级示例（缺 expression 行）**：
```
[DM_VISUAL]
酒馆里没什么动静。
```
→ 解析结果：`{ expression: "default", description: "酒馆里没什么动静。" }` + `warning("missing-field", "dmVisual.expression")`。

## 四、`[DIALOGUE]` 块

驱动 DialogueLog 卡片列表。

**格式**：每行一句对白，形如 `<speaker>: <text>`。冒号支持中英两种（`:` / `：`）。speaker 中允许空格与中文。空行被忽略。

**特殊约定**：
- 旁白用 `*<text>*`（首尾各一个星号、不加 speaker）会被解析为 `{ speaker: "旁白", text: "<text>" }`。
- 一行内不带冒号也不带星号 → 视为 `{ speaker: "Nyaa", text: <整行> }`，并记 `warning("dialogue-no-speaker", ...)`。

**Happy 示例**：
```
[DIALOGUE]
Nyaa: 喵～你确定要徒手撬这扇门？锈得跟你 INT 一样。
玩家: 我要试试。
*铁门发出不情愿的呻吟*
```

**降级示例（块为空）**：
```
[DIALOGUE]
```
→ `dialogue: []` + `warning("empty-block", "dialogue")`。UI 不渲染卡片。

## 五、`[GAME_STATE]` 块

驱动右侧状态栏 / 桌面事件横幅。

**子字段**（全部 `key: value` 行，未提供按默认值）：
- `location: <string>`（默认 `""`）
- `turn: <integer>`（默认 `0`；非整数 → 记 warning + 回退 `0`）
- `active_quest: <string>`（默认 `""`）
- `table_event: <string | none>`（值是 `none` / `-` / 空 → 解析为 `null`；其它字符串原样保留）

**Happy 示例**：
```
[GAME_STATE]
location: 边境酒馆门口
turn: 3
active_quest: 史莱姆讨伐
table_event: 外卖刚到，玩家把骰子蹭到了甜甜圈上
```

**降级示例（整块缺失）**：
```
（无 [GAME_STATE] 段）
```
→ `gameState: { location: "", turn: 0, activeQuest: "", tableEvent: null }` + `warning("missing-block", "gameState")`。UI 保留上一回合状态（合并由调用方负责）。

## 六、`[ACTION_PROMPT]` 块

驱动 ChoicePanel。三种 `type`：

### 6.1 `type: choices`
```
[ACTION_PROMPT]
type: choices
1. 用力撬门 (DC 15 力量检定)
2. 找钥匙 (调查地面)
3. 退一步, 我要换一个角色
4. 自由发挥
```
- 行首数字 + 点 + 空格作为 id 前缀（`1.` 解析为 id `1`），后跟 label。
- 最多 4 个选项；解析器多于 4 时取前 4 + 记 `warning("too-many-choices", n)`。
- 若一行不符合 `\d+\. .+` 模式 → 整行作为 label，自动分配递增 id + 记 `warning("choice-no-id", ...)`。

### 6.2 `type: free-text`
```
[ACTION_PROMPT]
type: free-text
placeholder: 描述你怎么做（30 字以内）
```
- `placeholder` 行可选。解析为 `{ kind: "free-text", placeholder }`。

### 6.3 `type: none`
```
[ACTION_PROMPT]
type: none
```
- 没有玩家输入需求（如 cinematic 过场）。UI 渲染"等待 Nyaa 继续"按钮。

### 6.4 缺 `type` 行
- 解析器尝试自动识别：若块体能匹配 `\d+\. .+` 多行 → 当 choices；若有 `placeholder:` → 当 free-text；否则 `none` + 记 `warning("missing-field", "actionPrompt.type")`。

## 七、警告（warnings）一览

解析器返回 `{ scene, warnings: ParseWarning[] }`。`ParseWarning` 形如：
```ts
type ParseWarning =
  | { kind: "missing-block"; block: string }
  | { kind: "missing-field"; path: string }
  | { kind: "unknown-block"; block: string }
  | { kind: "empty-block"; block: string }
  | { kind: "invalid-expression"; value: string }
  | { kind: "invalid-turn"; value: string }
  | { kind: "dialogue-no-speaker"; line: string }
  | { kind: "choice-no-id"; line: string }
  | { kind: "too-many-choices"; count: number };
```

UI 层默认不打扰玩家，只在沙盒页面 / dev 模式下展示。`gameEvents.emit('dm-parse-warning', { warnings })` 让 sarcasmTrigger 在严重情况下排队"DM 走神了"吐槽。

## 八、完整 Happy 样本

```
[DM_VISUAL]
expression: smug
铁门吱呀一声往后倒，灰尘簌簌落进玩家的领口。Nyaa 把尾巴尖从骰子上挪开，露出底面那个鲜红的"20"。

[DIALOGUE]
Nyaa: 喵——这扇门怕是早就想退休了。给你算"自然 20"，加力量修正后总值 24，DC 15 直接踩穿。
玩家: 这下能进去了？
Nyaa: 进吧进吧，里面别又是史莱姆。

[GAME_STATE]
location: 边境酒馆地下室门口
turn: 4
active_quest: 史莱姆讨伐
table_event: -

[ACTION_PROMPT]
type: choices
1. 推门进入地下室
2. 先看看门把手有没有陷阱 (调查 DC 12)
3. 让 Nyaa 先丢骰决定要不要进
4. 等等, 我先吃口甜甜圈
```

## 九、变更日志

| 日期 | 变更 |
|---|---|
| 2026-05-27 | v1 初版（M4 落地）：四块顺序、缺块容错、双方括号转义、9 类 warning |
