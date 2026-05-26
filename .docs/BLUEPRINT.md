# Dice & Drama 项目蓝图

> 给 Claude Code 与人工维护者共同看的"任务蓝图"。每完成一个阶段必须回到本文件更新状态、勾选检查项，然后通过 `commit-push` skill 推送到 GitHub。
>
> 本文不重复架构细节，架构快照见 `.docs/.work/PROJECT-OVERVIEW.md`；UI 配色铁律见 `.docs/UI-STYLE-GUIDE.md`；DSL 输出契约见 `.docs/dsl-spec.md`（M3/M4 阶段补齐）。

## 一、项目定位

《Dice & Drama》（骰子与戏精）是一款基于《Knights of Pen and Paper 2》设计的**像素风元 TRPG**。玩家围坐桌前，由白色双马尾、暗红双瞳、蓝衣的猫娘 `Nyaa` 担任 DM；游戏同时呈现"奇幻冒险世界"与"现实围桌吐槽"两层叙事。

- **技术栈**：Vite 6 + React 19 + TS 5.8 + Tailwind 4（前端，骨架取自 NyaaChat）
- **LLM**：浏览器直连，多 Provider（OpenAI / Anthropic / Gemini / DeepSeek / Qiny / Ollama），凭据存 LocalStorage
- **骰子**：项目内 nginx 反代 NyaaChat-MCP 的 `roll_dnd` / `roll_dice` / `roll_coc`，玩家无感
- **存档**：双轨——LocalStorage 主，登录后通过 `cloudsave` 子服务跨设备同步
- **部署**：本机构建 → 推 `h.hony-wen.com:5000` → 部署机 pull 更新；前端 3091，云存档 5105

## 二、关键决策（敲定后不再回滚）

| # | 决策 | 来源 |
|---|---|---|
| 1 | 全中文，无 i18n | 用户 2026-05-26 |
| 2 | MCP 项目内反代隐藏 Bearer，玩家无需配置 | 用户 2026-05-26 |
| 3 | 云存档双轨：LocalStorage 主、`cloudsave` 子服务为可选跨设备同步 | 用户 2026-05-26 |
| 4 | 游戏本身完全本地，仅同步功能需用户名/密码注册登录（不接 Discord OAuth） | 用户 2026-05-26 |
| 5 | 完全依赖 NyaaChat-MCP 现有工具，**不追加** | 用户 2026-05-26 |
| 6 | 端口：前端 3091 / 云存档 5105 | 用户 2026-05-26 |
| 7 | 镜像 push 到 `h.hony-wen.com:5000`，部署机 pull 更新（同 AVG-AdventurerTavern） | 用户 2026-05-26 |
| 8 | `cloudsave` 设计 game-agnostic，将来给其他游戏复用 | 用户 2026-05-26 |
| 9 | LLM 输出契约：四块 DSL `[DM_VISUAL]` / `[DIALOGUE]` / `[GAME_STATE]` / `[ACTION_PROMPT]` | 用户 2026-05-26 |
| 10 | 核心代码以非注释方式埋入签名 `Nyaa be with you.`（详见 `.docs/code-signature.md`） | 用户 2026-05-26 |
| 11 | KoPP2 机制仅作"灵感参考"——只借鉴公式/枚举/架构思路，**所有复用都要按本项目语境重写**，不抄源码字面、不抄文案、不抄美术（详见 `.ref/kopp2_rf/` + 本文第七节） | 用户 2026-05-26 |

## 三、里程碑总览（M0–M8）

```
M0 项目治理（本里程碑）
   │
   ▼
M1 双仓地基 + 镜像分发
   ├─→ M2 LLM 适配层移植
   ├─→ M3 MCP 骰子接入
   ├─→ M5 像素美术资产
   └─→ M7 通用云存档服务
                 │
                 ▼
              M4 DSL 叙事引擎  ← M2 + M3
                 │
                 ▼
              M6 玩法系统       ← M4 + M7
                 │
                 ▼
              M8 内容 + 适配打磨 ← M4 + M5 + M6 + M7
```

## 四、里程碑详情与状态

> 状态图例：⬜ 未开始 · 🟡 进行中 · ✅ 已完成 · ⏸ 暂缓

### M0 · 项目治理 ✅  _完成于 2026-05-26_

**目标**：项目蓝图、CLAUDE.md、skill 规范、git 仓库就绪。

- [x] `.docs/BLUEPRINT.md`（本文）
- [x] `.docs/.work/PROJECT-OVERVIEW.md`
- [x] `CLAUDE.md`
- [x] `.gitignore`
- [x] `.claude/skills/rebuild/SKILL.md`
- [x] `.claude/skills/commit-push/SKILL.md`
- [x] `.claude/skills/sync-blueprint/SKILL.md`
- [x] `git init` + `git remote add origin https://github.com/NyaaCaster/DiceAndDrama.git`
- [x] 首次 commit + `git push -u origin master`

### M1 · 双仓地基 + 镜像分发 ✅  _完成于 2026-05-26_

**目标**：`client/` 与 `cloudsave-server/` 双子目录骨架，含 Dockerfile、compose、rebuild/update 脚本，前端能跑 hello world，docker network `dicedrama-net` 启用。

- [x] 创建 `client/`：从 NyaaChat 拷 `vite.config.ts` / `tsconfig.json` / `eslint.config.js` / `package.json` / `tailwind` 等；React 19 + Tailwind 4 起 hello world
- [x] 创建 `cloudsave-server/`：Express + better-sqlite3 + bcrypt 工程骨架，能跑 `/healthz`
- [x] `client/Dockerfile`（多阶段，nginx-alpine runtime，目标 ≤40 MB；当前 48.5 MB，留待后续优化）
- [x] `cloudsave-server/Dockerfile`（多阶段，node-alpine runtime + 删 `*.md` `LICENSE` `CHANGELOG` `*.d.ts` `*.map`，目标 ≤120 MB；当前 155 MB，留待后续优化）
- [x] `client/nginx.conf.template`：`/api/mcp` 反代注入 Bearer + `/api/cloudsave/*` 反代到 docker 内网 `cloudsave:5105` + SPA fallback
- [x] `client/docker-compose.yml`（端口 3091:80，挂 `dicedrama-net` external 网络）
- [x] `cloudsave-server/docker-compose.yml`（端口 5105:5105，卷 `cloudsave_data:/app/data`，挂 `dicedrama-net`）
- [x] 各自 `rebuild.ps1` / `rebuild.sh`：本机 build → tag latest + commit short → push `h.hony-wen.com:5000`
- [x] 各自 `update-and-restart.ps1` / `.sh`：部署机 pull → up -d → prune
- [x] 各自 `.dockerignore` / `.env.example`
- [x] 顶层 `README.md`：双仓部署流程 + `docker network create dicedrama-net` 一次性步骤
- [x] 网页 favicon：基于 `.ref/icon.png`（1024×1024 透明 PNG）导出多尺寸 PNG（`favicon-32.png` / `favicon-180.png` apple-touch-icon + `favicon.ico`）放到 `client/public/`
- [x] `client/src/version.ts` 与 `cloudsave-server/src/version.ts` 导出 `BLESSING = "Nyaa be with you."`
- [x] client 至少 2 处埋点：HTML `data-blessing` + 控制台 boot 日志 + JS bundle 内 `data-blessing={BLESSING}` 属性
- [x] cloudsave 至少 2 处埋点：`/healthz` 响应头 `X-Blessing` + 进程启动日志（`[cloudsave] Nyaa be with you.`）
- [x] 构建产物 grep 验证：`dist/assets/*.js` 中能搜到 `Nyaa be with you.`（前端）；`/healthz -I` 能看到 `X-Blessing` 响应头（后端）

**完成判定**：本机依次跑 `cloudsave-server/rebuild.ps1` 与 `client/rebuild.ps1` 都能成功推到 registry；部署机跑 `update-and-restart.ps1` 后访问 http://localhost:3091 看到 hello world，`/api/cloudsave/healthz` 返回 200；`.docs/code-signature.md` 第五节检查清单全过。

### M2 · 移植 LLM 适配层 🟡

**目标**：把 NyaaChat 的 LLM 接入层移植到 `client/src/services/llm/`，封装为 `runDmTurn()` 顶层接口。

- [ ] 移植 `lib/providers.ts`（六家预设 + 多 Provider 数据模型）
- [ ] 移植 `lib/api.ts`（统一 chat completion，OpenAI/Anthropic 双格式、流式、ApiHttpError、tool-use 多轮、cache token 上报）
- [ ] 移植 `lib/chatPipeline.ts`（消息编排）
- [ ] `services/llm/runDmTurn.ts`：包装出 `runDmTurn(messages, tools, opts)` 顶层接口，固定 system prompt 模板由调用方注入
- [ ] 设置面板：Provider/Model 选择 + 健康测试（迁移自 NyaaChat 的 LlmProvidersModal）

**完成判定**：在设置面板填入任意 OpenAI 兼容 Key，发送一条 prompt，能拿到流式回复。

### M3 · MCP 骰子接入 ⬜

**目标**：完全无感地把 NyaaChat-MCP 的 `roll_dnd` / `roll_dice` / `roll_coc` 暴露给 LLM 作为可调用工具，骰值由 MCP 真随机决定。

- [ ] 移植 `lib/mcpApi.ts` 到 `services/mcp/`（JSON-RPC over SSE）
- [ ] `nginx.conf.template` 已含 `/api/mcp` 反代 + envsubst 注入 `MCP_API_KEY`
- [ ] `services/mcp/diceTools.ts`：把 MCP 三个工具按 `LlmTool` 形状暴露给 LLM
- [ ] `components/DiceRoller.tsx`：像素掷骰动画，结果由 MCP 返回值驱动（前端只演不算）
- [ ] system prompt 中钉死："任何检定必须先调用 `roll_dnd` / `roll_dice` 拿到骰值再叙事，禁止编造骰值"
- [ ] `/api/mcp/health` 健康探活按钮在设置面板暴露

**完成判定**：让 LLM 演一次"力量检定"，能看到工具调用日志、像素骰子动画、最终叙事中引用的骰值与工具返回完全一致。

### M4 · DSL 叙事引擎 ⬜

**目标**：四块 DSL 解析、SceneRunner 状态机、Nyaa 表情控制器全部就绪；把"先调骰子再叙事"作为强约束写入 system prompt。

> **KoPP2 参考链**：本里程碑要落地"事件总线 → Nyaa 元吐槽触发器"架构，灵感来自 KoPP2 的 `StatsCenter` 静态事件中心。详见 `.ref/kopp2_rf/01-mechanics.md` 第十一节、`.ref/kopp2_rf/02-adoption-notes.md` 第四节。**不要抄 KoPP2 的 30+ Action 字面表**——本项目按自己需要列出 ~20 个领域事件（`skill-used` / `monster-killed` / `dice-rolled` / `place-first-visit` / `spent-gold` …），用 `mitt` 重写一份 typed 事件总线。

- [ ] `.docs/dsl-spec.md`：DSL 四块格式规范（含容错、转义、空块语义）
- [ ] `engine/parseSceneBlocks.ts`：解析 `[DM_VISUAL]` / `[DIALOGUE]` / `[GAME_STATE]` / `[ACTION_PROMPT]`，缺块容错 + 单测
- [ ] `engine/SceneRunner.ts`：串联多回合 Scene，记录玩家选择、与 LocalStorage 绑定
- [ ] `engine/dmExpressionMap.ts`：DMVisual 文本 → Nyaa 精灵帧动画的关键词映射
- [ ] `services/events/gameEvents.ts`：基于 `mitt` 的 typed 领域事件总线（参照 `.ref/kopp2_rf/02-adoption-notes.md` 第四节"设计映射"表，**重新设计**事件名与 payload 形状，不照搬）
- [ ] `services/dm/sarcasmTrigger.ts`：把领域事件翻译成"待 Nyaa 吐槽事件"队列，下次 `runDmTurn()` 调用时作为 `userText` 注入
- [ ] `components/Typewriter.tsx` + `DialogueLog.tsx` + `ChoicePanel.tsx`
- [ ] system prompt（写入 `services/llm/dmSystemPrompt.ts`）：固化输出格式、骰子先行约束、Nyaa 人格
- [ ] 全套四块输出的端到端 happy path

**完成判定**：随手输入一条玩家行动，LLM 返回的四块 DSL 能被引擎完整解析并驱动 UI；DMVisual 正确触发 Nyaa 表情切换；连续 2 次 1 点骰会通过事件总线 → 吐槽队列触发 Nyaa 一句"你这运气是把骰子供起来当祖宗了？"级别的吐槽。

### M5 · 像素美术资产 ⬜

**目标**：基于参考图绘制 Nyaa 像素精灵 + 场景 + 怪物 + UI Kit；响应式根布局上线。

- [ ] 从 `.ref/pic/nyaa1-3.png` 提取色板（脚本化，输出 `assets/pixel/palette.json`）
- [ ] Nyaa 32×32 与 64×64 双版本，8 种表情/动作：默认 / 翻白眼 / 抽搐耳 / 吃甜甜圈 / 撸猫 / 惊讶 / 得意 / 瞌睡
- [ ] 4 个玩家头像（Nerd / Grandma / 原创 2 个）
- [ ] 桌面场景（俯视/侧视）+ 奇幻地图 4 节点 + 战斗地块
- [ ] 8 只怪物：史莱姆 / 骷髅 / 哥布林 / 蝙蝠 / 巨鼠 / 巫师 / 龙 / Boss
- [ ] 像素 UI Kit：9-slice 边框、像素字体（开源 `Press Start 2P` 或 `VT323`）、按钮三态
- [ ] 游戏主 logo：以 `.ref/game_logo.png` 为参考重绘为像素风正式资产（透明背景 PNG + SVG 双版本），落到 `client/src/assets/pixel/logo/`，用于启动画面与主菜单标题
- [ ] `assets/pixel/manifest.json` 索引全部精灵
- [ ] 响应式根布局：PC 横屏左右双栏（奇幻 ↔ 桌面），手机竖屏上下切换 + 顶部 Tab
- [ ] `.docs/UI-STYLE-GUIDE.md`：配色铁律、像素网格、滚动条、字号

**完成判定**：所有像素资产在 demo 页面网格展示无失真；横竖屏切换流畅。

### M6 · 玩法系统 ⬜

**目标**：角色创建、回合制战斗、节点世界地图、任务/背包/商店、随机桌面事件全部跑通。

> **KoPP2 参考链**：本里程碑是 KoPP2 机制借鉴的主战场。详见 `.ref/kopp2_rf/01-mechanics.md` 全文（公式与枚举）+ `.ref/kopp2_rf/02-adoption-notes.md` 第二/三/五/六节（被动 build / 数据驱动修饰词 / 5e 化判定 / 直接可用常数）。**版权边界**：只搬公式与枚举骨架；技能/物品/状态的具体数值、文案、图标全部按本项目自己设计。
>
> 本里程碑允许直接搬的常数（写到 `engine/constants.ts`）：
> - `expToNextLevel(level) = level² × 30 + 30`
> - `questXpReward(levelAvg) = round((60 + levelAvg² × 15) × (1 + xpBonus))`
> - `questGoldReward(levelAvg) = round(levelAvg × 1.5)`
> - 怪物战利品：金币 20% / 物品 20% / 任务怪物品 70%
> - 伤害浮动 ±25%
>
> 本里程碑必须**改造**而不是照搬：
> - 攻击解析：用 5e 标准 `roll_dnd 1d20+atk vs AC`，**不**用 KoPP2 的"必中 + 浮动"
> - 抵抗骰：用 5e 正向 `roll_dnd 1d20+save vs DC`，**不**用 KoPP2 的反向 d20
> - 暴击：natural 20，**不**用 KoPP2 的百分比制
> - 先攻：`1d20 + DEX_mod`，**不**用 KoPP2 的 1d12
> - 属性：本项目用 D&D 5e 的 STR/DEX/CON/INT/WIS/CHA 子集（先选 4 个），**不**用 KoPP2 的三属性

- [ ] 角色创建：职业 / 属性点 / 外观 / 起始装备
- [ ] `engine/constants.ts`：写入上述可直接搬的常数（KoPP2_INSPIRED 命名空间，注释里点明出处但不抄字面表）
- [ ] `engine/skillTriggers.ts`：精简到 12 种 SkillTriggerType（参照 `.ref/kopp2_rf/02-adoption-notes.md` 第二节列表，按本项目战斗循环重新命名为 `active.*` / `passive.*` / `trigger.*` 三类）
- [ ] `engine/itemAttributes.ts`：精简到约 25 种 ItemAttributeType（参照 `.ref/kopp2_rf/02-adoption-notes.md` 第三节，类型名按 kebab-case 重写，不照抄 PascalCase）
- [ ] `content/items/*.yaml`：每件装备是 `(类型, 值)` 字典，由 `Character` 派生属性时遍历累加
- [ ] `engine/conditions.ts`：7 种状态（Wound/Burn/Poison/Stun/Confusion/Weakness/Rage），按本项目数值表重新平衡，**不**抄 KoPP2 的 `_damage / _damageIncreaseOverTime` 字面参数
- [ ] 回合制战斗：先攻 → 攻击/技能/物品/逃跑，攻击 → MCP `roll_dnd` → 伤害 `roll_dice` → 触发 hook → Nyaa 旁白闭环
- [ ] 触发器调度：每个角色身上挂的 skills/buffs/items 注册到 `triggerIndex: Map<TriggerType, Effect[]>`，攻击解析时按顺序 `fireTriggers(...)`
- [ ] 节点世界地图：节点点击触发 Scene，与 SceneRunner 联动
- [ ] 任务系统：精简到 6 种 QuestType（Slay / Collect / Travel / Battle / Bribe / Waves），主线/支线 JSON，与 `[GAME_STATE]` 中 `Active Quest` 字段联动
- [ ] 商店 / 背包 / 装备 / 经验升级（用上面的 `expToNextLevel` 常数）
- [ ] 随机桌面事件：30% 概率在战斗结束时插入"外卖到了 / 猫打翻骰子 / 邻居敲门"，Nyaa 即兴吐槽
- [ ] 三个本地存档槽 UI（New Game / Continue / Erase）

**完成判定**：从新建角色 → 进入序章 → 打一场战斗 → 结束并存档 → 重启游戏从存档恢复，全程无故障；战斗中至少能观察到一条"装备/被动技能"通过触发器影响伤害结算，证明数据驱动的修饰词系统通路打通。

### M7 · 通用云存档服务 🟡  _服务端 M1 提前完成，待客户端落地_

**目标**：`cloudsave` 子服务上线，game-agnostic，前端实现双轨同步。

- [x] DB schema：`users / apps / saves / sessions`（apps 用 slug 区分游戏）_（M1 提前完成）_
- [x] REST v1 API：`/v1/auth/{register,login,logout,me}` + `/v1/apps/:slug/slots[/:slotId]` + `/healthz` _（M1 提前完成）_
- [x] bcrypt(cost=12) + 32 字节 token + 登录失败限速（5 次/15 分）_（M1 提前完成）_
- [x] CORS 白名单可通过 `ALLOWED_ORIGINS` env 配置 _（M1 提前完成）_
- [x] 乐观并发：PUT 可选传 `baseVersion`，不匹配返回 409 + 当前数据 _（M1 提前完成）_
- [ ] 前端 `services/save/cloudSave.ts`：用 `APP_SLUG = "dicedrama"` 调 `/api/cloudsave/v1/*`
- [ ] 前端 `services/save/syncManager.ts`：未登录走 LocalStorage；登录后 last-write-wins 默认策略 + 冲突弹窗
- [ ] 注册/登录/退出 UI（仅同步面板可见，不影响主菜单）
- [ ] cloudsave-server 单测：auth happy path、并发冲突、跨 app 隔离

**完成判定**：用账号 A 在机器 1 存档 → 在机器 2 登录后能拉到同一份存档；不同 app slug 互不可见。

### M8 · 内容 + 适配打磨 ⬜

**目标**：序章 + 第 1 章剧本与吐槽库齐备；手机竖屏与跨端测试通过；正式打包发布 v0.1.0。

> **KoPP2 参考链**：本里程碑首版可裁剪到 5–6 种 QuestType + 2 种地形效果（随机施加状态 / 限制后排攻击）。详见 `.ref/kopp2_rf/02-adoption-notes.md` 第八节。**剧本文案与吐槽词全部原创**——KoPP2 的对白与剧情字符串不在借鉴范围内。

- [ ] `content/00-prologue.scene.md`：开新团 + 角色创建教学
- [ ] `content/01-tavern.scene.md`：边境酒馆 → 史莱姆战斗 + 1 个支线
- [ ] ≥ 20 段 Nyaa 经典吐槽（可作为 prompt 注入素材）
- [ ] 手机竖屏：底部弹出对话面板 + 滑动选项条 + 双指缩放奇幻图层
- [ ] 触摸手势 + 键盘快捷键（PC：1-4 数字键选项、Space 跳过、Esc 暂停）
- [ ] 设置面板：LLM Provider/Key / MCP 健康 / 打字机速度 / 字号 / 音量
- [ ] 性能：精灵图预加载 + 场景懒加载，首屏 < 2 s
- [ ] 跨端测试矩阵：Chrome/Edge/Safari × Windows/macOS/Android/iOS
- [ ] `README.md` 终稿 + `CHANGELOG.md` 起头
- [ ] tag `v0.1.0`，触发 rebuild + push registry
- [ ] 发版前过一遍 `.docs/code-signature.md` 第五节检查清单（确认压缩 / Tree-shake 后签名仍在）

**完成判定**：手机扫二维码进入网页能完整通关序章 + 第 1 章；PC Chrome 全键盘操作通关；签名 `Nyaa be with you.` 在前端 bundle 与后端响应头中均可被 grep 到。

## 五、阶段交付与提交节奏

每完成一个里程碑：

1. **更新本蓝图**：把对应里程碑的所有 `- [ ]` 勾选为 `- [x]`，状态符号换成 ✅，写一行 _完成日期 + 简要交付总结_
2. **同步架构快照**：若改动了调用链路、关键契约、关键文件地图，必须同步更新 `.docs/.work/PROJECT-OVERVIEW.md`
3. **提交 + 推送**：通过 `commit-push` skill 推到 `origin master`，提交信息按 Conventional Commits 风格
4. **标签**：M2/M4/M6/M7/M8 完成时打 tag `m2-llm-ready` / `m4-engine-ready` / ... 便于回滚

详细规则见 `.claude/skills/sync-blueprint/SKILL.md`。

## 六、外部参考与版权边界

本项目的"灵感参考资料"集中在仓库**不入 git** 的 `.ref/` 目录里，仅供 NyaaCaster 本人本机参考。引用链与边界规则如下：

### 6.1 引用资料清单

| 路径 | 内容 | 入 git？ | 主要服务的里程碑 |
|---|---|---|---|
| `.ref/pic/` | 设计参考图（Nyaa 形象 + KoPP2 截图） | ❌ | M5 |
| `.ref/game_logo.png` | 游戏主 logo 草稿（待 M5 阶段适配为像素风正式资产并挪入 `client/src/assets/`） | ❌ | M5 |
| `.ref/icon.png` | 网页 favicon 草稿（1024×1024 透明 PNG，已扣背景）；M1 落地时由它导出多尺寸 favicon，并酌情手绘成 SVG 以获得任意分辨率清晰度 | ❌ | M1 |
| `.ref/kopp2_rf/01-mechanics.md` | KoPP2 反编译机制总结：属性体系、衍生公式、攻击流程、抵抗骰、状态、22 种技能触发、41+ 物品属性、事件总线、14 种任务、随机遭遇 | ❌ | M4 / M6 / M8 |
| `.ref/kopp2_rf/02-adoption-notes.md` | 每条机制的"复用 / 改造 / 抛弃 / 原创"决策表，按里程碑落点 | ❌ | M4 / M6 / M8 |
| `.ref/kopp2_rf/README.md` | 反编译流程记录、版权边界、后续步骤 | ❌ | 全程 |

### 6.2 KoPP2 借鉴的版权红线（铁律，违反 = 删除重写）

1. **只借鉴公式、枚举骨架与架构思路**——例如经验曲线 `level² × 30 + 30`、22 种 SkillTriggerType 的"被动 build hook"模式、StatsCenter 的事件总线模式
2. **不抄 C# 源码字面表达**——本项目实现是 TypeScript，命名风格、模块切分、类型形状全部按本项目自己的工程规范重写
3. **不抄对白文案、剧情字符串、技能/物品的描述文本**——所有玩家可见文本由 NyaaCaster 原创（包括 Nyaa 的吐槽语料）
4. **不抄美术、音频、ScriptableObject 数据资产**——像素美术 100% 由本项目重新绘制（M5）
5. **不抄具体数值表**——KoPP2 的怪物 HP / 装备伤害 / 技能消耗等数字仅作"量级参考"，本项目按自己的数值平衡重新调
6. **反编译产物本身不入 git、不入 `.ref/`**——只在本机临时目录分析，分析完即删

### 6.3 借鉴优先级（决定每个里程碑要回头翻哪份分析）

| 阶段 | 必读 `.ref/kopp2_rf/` 章节 | 借鉴产出 |
|---|---|---|
| M4 | `01-mechanics.md` 第十一节 + `02-adoption-notes.md` 第四节 | `services/events/gameEvents.ts` + `services/dm/sarcasmTrigger.ts` |
| M6 | `01-mechanics.md` 第二/三/四/五/六/七/八/九节 + `02-adoption-notes.md` 第二/三/五/六节 | `engine/constants.ts` + `engine/skillTriggers.ts` + `engine/itemAttributes.ts` + `engine/conditions.ts` + 战斗解析流程 |
| M8 | `01-mechanics.md` 第十/十二节 + `02-adoption-notes.md` 第八节 | 5–6 种 QuestType + 2 种地形效果 |

### 6.4 自检：什么是"重写"，什么是"照抄"

| 行为 | 是否允许 |
|---|---|
| 在 `engine/constants.ts` 写 `expToNextLevel = (lvl) => lvl ** 2 * 30 + 30` | ✅ 公式是数学事实，不构成著作权对象 |
| 把 KoPP2 的 `SkillTriggerType` 枚举翻成 TypeScript 联合类型，**精简到 12 项**且重命名为 `active.*` / `trigger.*` 形式 | ✅ 是"骨架借鉴 + 重新设计"，不是字面复制 |
| 把 KoPP2 的 `Character.cs` 的 GetMaxHp 函数体直译成 TypeScript | ❌ 字面表达复制 → 必须重写 |
| 把 KoPP2 怪物的 HP/攻击数值表搬过来 | ❌ 数值表是表达 + 本项目要按 5e 重新平衡 |
| 在剧本里写"知识就是力量～又是新人来送经验呢"之类的 KoPP2 风格台词 | ❌ 文案必须原创，避开 KoPP2 的具体台词 |
| 用 KoPP2 的 Nerd / Grandma 角色概念 | ⚠️ 角色概念是元 TRPG 通用梗，可借用**但**人设、立绘、台词全部原创 |

## 七、变更日志

| 日期 | 变更 | 关联 commit |
|---|---|---|
| 2026-05-26 | 蓝图初版（M0 启动） | _待 init commit_ |
| 2026-05-26 | M0.5 完成：KoPP2 反编译与机制分析（不入 git，仅 `.ref/kopp2_rf/`）；新增决策 #11；M4/M6/M8 各加 KoPP2 引用链；新增第六节"外部参考与版权边界" | _本次会话_ |
| 2026-05-26 | 登记 `.ref/game_logo.png` 与 `.ref/icon.png` 草稿资产（icon 已扣透明）；M1 加 favicon 多尺寸导出任务，M5 加游戏 logo 像素化任务 | _本次会话_ |
| 2026-05-26 | M1 完成：双仓骨架 + Docker pipeline + registry `h.hony-wen.com:5000` push 跑通 + cloudsave 完整后端（schema / auth / saves / 乐观并发 / X-Blessing 头）；M7 服务端 5 项随 M1 提前完成；M2 进入 🟡 | _待 commit_ |
