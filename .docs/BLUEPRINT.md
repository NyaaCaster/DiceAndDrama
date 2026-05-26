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

### M0 · 项目治理 🟡

**目标**：项目蓝图、CLAUDE.md、skill 规范、git 仓库就绪。

- [x] `.docs/BLUEPRINT.md`（本文）
- [x] `.docs/.work/PROJECT-OVERVIEW.md`
- [x] `CLAUDE.md`
- [x] `.gitignore`
- [x] `.claude/skills/rebuild/SKILL.md`
- [x] `.claude/skills/commit-push/SKILL.md`
- [x] `.claude/skills/sync-blueprint/SKILL.md`
- [ ] `git init` + `git remote add origin https://github.com/NyaaCaster/DiceAndDrama.git`
- [ ] 首次 commit + `git push -u origin master`

### M1 · 双仓地基 + 镜像分发 ⬜

**目标**：`client/` 与 `cloudsave-server/` 双子目录骨架，含 Dockerfile、compose、rebuild/update 脚本，前端能跑 hello world，docker network `dicedrama-net` 启用。

- [ ] 创建 `client/`：从 NyaaChat 拷 `vite.config.ts` / `tsconfig.json` / `eslint.config.js` / `package.json` / `tailwind` 等；React 19 + Tailwind 4 起 hello world
- [ ] 创建 `cloudsave-server/`：Express + better-sqlite3 + bcrypt 工程骨架，能跑 `/healthz`
- [ ] `client/Dockerfile`（多阶段，nginx-alpine runtime，目标 ≤40 MB）
- [ ] `cloudsave-server/Dockerfile`（多阶段，node-alpine runtime + 删 `*.md` `LICENSE` `CHANGELOG` `*.d.ts` `*.map`，目标 ≤120 MB）
- [ ] `client/nginx.conf.template`：`/api/mcp` 反代注入 Bearer + `/api/cloudsave/*` 反代到 docker 内网 `cloudsave:5105` + SPA fallback
- [ ] `client/docker-compose.yml`（端口 3091:80，挂 `dicedrama-net` external 网络）
- [ ] `cloudsave-server/docker-compose.yml`（端口 5105:5105，卷 `cloudsave_data:/app/data`，挂 `dicedrama-net`）
- [ ] 各自 `rebuild.ps1` / `rebuild.sh`：本机 build → tag latest + commit short → push `h.hony-wen.com:5000`
- [ ] 各自 `update-and-restart.ps1` / `.sh`：部署机 pull → up -d → prune
- [ ] 各自 `.dockerignore` / `.env.example`
- [ ] 顶层 `README.md`：双仓部署流程 + `docker network create dicedrama-net` 一次性步骤
- [ ] `client/src/version.ts` 与 `cloudsave-server/src/version.ts` 导出 `BLESSING = "Nyaa be with you."`
- [ ] client 至少 2 处埋点：HTML `data-blessing` + 控制台 boot 日志
- [ ] cloudsave 至少 2 处埋点：`/healthz` 响应头 `X-Blessing` + 进程启动日志
- [ ] 构建产物 grep 验证：`dist/assets/*.js` 中能搜到 `Nyaa be with you.`（前端）；`/healthz -I` 能看到 `X-Blessing` 响应头（后端）

**完成判定**：本机依次跑 `cloudsave-server/rebuild.ps1` 与 `client/rebuild.ps1` 都能成功推到 registry；部署机跑 `update-and-restart.ps1` 后访问 http://localhost:3091 看到 hello world，`/api/cloudsave/healthz` 返回 200；`.docs/code-signature.md` 第五节检查清单全过。

### M2 · 移植 LLM 适配层 ⬜

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

- [ ] `.docs/dsl-spec.md`：DSL 四块格式规范（含容错、转义、空块语义）
- [ ] `engine/parseSceneBlocks.ts`：解析 `[DM_VISUAL]` / `[DIALOGUE]` / `[GAME_STATE]` / `[ACTION_PROMPT]`，缺块容错 + 单测
- [ ] `engine/SceneRunner.ts`：串联多回合 Scene，记录玩家选择、与 LocalStorage 绑定
- [ ] `engine/dmExpressionMap.ts`：DMVisual 文本 → Nyaa 精灵帧动画的关键词映射
- [ ] `components/Typewriter.tsx` + `DialogueLog.tsx` + `ChoicePanel.tsx`
- [ ] system prompt（写入 `services/llm/dmSystemPrompt.ts`）：固化输出格式、骰子先行约束、Nyaa 人格
- [ ] 全套四块输出的端到端 happy path

**完成判定**：随手输入一条玩家行动，LLM 返回的四块 DSL 能被引擎完整解析并驱动 UI；DMVisual 正确触发 Nyaa 表情切换。

### M5 · 像素美术资产 ⬜

**目标**：基于参考图绘制 Nyaa 像素精灵 + 场景 + 怪物 + UI Kit；响应式根布局上线。

- [ ] 从 `.ref/pic/nyaa1-3.png` 提取色板（脚本化，输出 `assets/pixel/palette.json`）
- [ ] Nyaa 32×32 与 64×64 双版本，8 种表情/动作：默认 / 翻白眼 / 抽搐耳 / 吃甜甜圈 / 撸猫 / 惊讶 / 得意 / 瞌睡
- [ ] 4 个玩家头像（Nerd / Grandma / 原创 2 个）
- [ ] 桌面场景（俯视/侧视）+ 奇幻地图 4 节点 + 战斗地块
- [ ] 8 只怪物：史莱姆 / 骷髅 / 哥布林 / 蝙蝠 / 巨鼠 / 巫师 / 龙 / Boss
- [ ] 像素 UI Kit：9-slice 边框、像素字体（开源 `Press Start 2P` 或 `VT323`）、按钮三态
- [ ] `assets/pixel/manifest.json` 索引全部精灵
- [ ] 响应式根布局：PC 横屏左右双栏（奇幻 ↔ 桌面），手机竖屏上下切换 + 顶部 Tab
- [ ] `.docs/UI-STYLE-GUIDE.md`：配色铁律、像素网格、滚动条、字号

**完成判定**：所有像素资产在 demo 页面网格展示无失真；横竖屏切换流畅。

### M6 · 玩法系统 ⬜

**目标**：角色创建、回合制战斗、节点世界地图、任务/背包/商店、随机桌面事件全部跑通。

- [ ] 角色创建：职业 / 属性点 / 外观 / 起始装备
- [ ] 回合制战斗：先攻 → 攻击/技能/物品/逃跑，攻击 → MCP `roll_dnd` → 伤害 `roll_dice` → Nyaa 旁白闭环
- [ ] 节点世界地图：节点点击触发 Scene，与 SceneRunner 联动
- [ ] 任务系统：主线/支线 JSON，与 `[GAME_STATE]` 中 `Active Quest` 字段联动
- [ ] 商店 / 背包 / 装备 / 经验升级
- [ ] 随机桌面事件：30% 概率在战斗结束时插入"外卖到了 / 猫打翻骰子 / 邻居敲门"，Nyaa 即兴吐槽
- [ ] 三个本地存档槽 UI（New Game / Continue / Erase）

**完成判定**：从新建角色 → 进入序章 → 打一场战斗 → 结束并存档 → 重启游戏从存档恢复，全程无故障。

### M7 · 通用云存档服务 ⬜

**目标**：`cloudsave` 子服务上线，game-agnostic，前端实现双轨同步。

- [ ] DB schema：`users / apps / saves / sessions`（apps 用 slug 区分游戏）
- [ ] REST v1 API：`/v1/auth/{register,login,logout,me}` + `/v1/apps/:slug/slots[/:slotId]` + `/healthz`
- [ ] bcrypt(cost=12) + 32 字节 token + 登录失败限速（5 次/15 分）
- [ ] CORS 白名单可通过 `ALLOWED_ORIGINS` env 配置
- [ ] 乐观并发：PUT 可选传 `baseVersion`，不匹配返回 409 + 当前数据
- [ ] 前端 `services/save/cloudSave.ts`：用 `APP_SLUG = "dicedrama"` 调 `/api/cloudsave/v1/*`
- [ ] 前端 `services/save/syncManager.ts`：未登录走 LocalStorage；登录后 last-write-wins 默认策略 + 冲突弹窗
- [ ] 注册/登录/退出 UI（仅同步面板可见，不影响主菜单）
- [ ] cloudsave-server 单测：auth happy path、并发冲突、跨 app 隔离

**完成判定**：用账号 A 在机器 1 存档 → 在机器 2 登录后能拉到同一份存档；不同 app slug 互不可见。

### M8 · 内容 + 适配打磨 ⬜

**目标**：序章 + 第 1 章剧本与吐槽库齐备；手机竖屏与跨端测试通过；正式打包发布 v0.1.0。

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

## 六、变更日志

| 日期 | 变更 | 关联 commit |
|---|---|---|
| 2026-05-26 | 蓝图初版（M0 启动） | _待 init commit_ |
