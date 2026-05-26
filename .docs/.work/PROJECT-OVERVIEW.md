# Dice & Drama · Claude Code 启动简报

> 给 Claude Code 看的"项目快照"。每次开新会话先读这里 + `CLAUDE.md` + `.docs/BLUEPRINT.md`，避免重新摸盘。
> 本文件描述的是**架构与协作契约**（不易过期），具体代码请以仓库当下状态为准。
> 若发现本文与代码冲突，请相信代码并顺手更新本文。

## 一句话定位

**LLM 演 Nyaa（DM 猫娘），MCP 真随机骰，前端 DSL 解析器驱动 UI。** 三者通过四块 DSL 单向触发，奇幻冒险与现实围桌两层叙事并存。

## 技术栈速查

| 层 | 选型 |
|---|---|
| 前端 | Vite 6 + React 19 + TS 5.8 + Tailwind 4 + motion |
| LLM | OpenAI / Anthropic / Gemini / DeepSeek / Qiny / Ollama（**全部浏览器直连**，凭据存 LocalStorage） |
| 骰子 | NyaaChat-MCP `roll_dnd` / `roll_dice` / `roll_coc`，`crypto.randomInt` 真随机；项目内 nginx 反代隐藏 Bearer |
| 云存档 | `cloudsave` 独立子服务（Express + better-sqlite3 + bcrypt），game-agnostic，按 `appSlug` 隔离 |
| 部署 | 双 Docker 镜像，本机构建 push 到 `h.hony-wen.com:5000`；前端 3091 / 云存档 5105 |

## 仓库布局

```
DiceAndDrama/
├─ client/                 ← 前端（nginx + 静态资源）容器
│  ├─ src/
│  │  ├─ components/       ← 像素 UI：PixelButton / NinePatchFrame / NyaaSprite / DiceRoller
│  │  ├─ scenes/           ← FantasyView / TableView / BattleView / MapView
│  │  ├─ engine/           ← parseSceneBlocks / SceneRunner / dmExpressionMap
│  │  ├─ services/
│  │  │  ├─ llm/           ← runDmTurn / providers / api（移植自 NyaaChat）
│  │  │  ├─ mcp/           ← mcpApi + diceTools
│  │  │  └─ save/          ← localSave + cloudSave + syncManager
│  │  ├─ content/          ← *.scene.md（DSL 剧本）+ characterCards.ts
│  │  ├─ assets/pixel/     ← Nyaa 精灵 + 怪物 + 场景 + UI Kit + manifest.json
│  │  └─ types.ts
│  ├─ Dockerfile / nginx.conf.template / docker-compose.yml
│  ├─ rebuild.ps1 / rebuild.sh / update-and-restart.ps1 / update-and-restart.sh
│  └─ package.json / vite.config.ts / tsconfig.json
│
├─ cloudsave-server/       ← 通用云存档子服务容器（game-agnostic）
│  ├─ src/
│  │  ├─ index.ts          ← Express 入口
│  │  ├─ db.ts             ← better-sqlite3 + migrations
│  │  ├─ routes/auth.ts    ← register / login / logout / me
│  │  ├─ routes/saves.ts   ← apps/:slug/slots[/...]
│  │  └─ middleware/       ← bearer auth / rate limit
│  ├─ Dockerfile / docker-compose.yml
│  ├─ rebuild.ps1 / rebuild.sh / update-and-restart.ps1 / update-and-restart.sh
│  └─ package.json / tsconfig.json
│
├─ .docs/                  ← 项目规范与决策文档（人 + Claude Code 共同读）
│  ├─ BLUEPRINT.md         ← 任务蓝图（M0–M8 状态）
│  ├─ dsl-spec.md          ← LLM 四块输出契约（M3/M4 阶段补齐）
│  ├─ UI-STYLE-GUIDE.md    ← 像素配色与 UI 铁律（M5 阶段补齐）
│  ├─ NyaaChat-MCP.md      ← MCP 工具规格摘录
│  └─ .work/
│     └─ PROJECT-OVERVIEW.md   ← 本文
├─ .claude/skills/         ← Claude Code 工作流 skill
│  ├─ rebuild/             ← 镜像重建 + 推送
│  ├─ commit-push/         ← git 提交规范
│  └─ sync-blueprint/      ← 阶段完成时同步蓝图 + 推送
├─ .ref/pic/               ← 设计参考图（Nyaa 形象 + KoPP2 截图）
└─ README.md               ← 顶层部署说明
```

## DSL 输出契约（每回合的"信号总线"）

LLM（演 Nyaa）每回合返回**严格四块**结构，前端 `parseSceneBlocks()` 解析后驱动 UI：

```
[DM_VISUAL]
*Nyaa 翘起尾巴尖，把骰子从桌沿拨下去，眯眼笑*

[DIALOGUE]
DM (Nyaa): "喵～你们推开酒馆门，一只眼神死的史莱姆正在啃桌腿。"
Player_Nerd: "我先甩本《怪物图鉴》查它弱点。"

[GAME_STATE]
- Location: 边境酒馆 / 现实：客厅，外卖刚到
- Active Quest: 调查史莱姆入侵
- Table Event: 玩家A起身去拿外卖，回合暂停

[ACTION_PROMPT]
1. 让 Nerd 投智力检定查弱点
2. Grandma 直接动手（毛线针 +2 暴击率）
3. 跟史莱姆讲道理（魅力检定）
4. 偷偷把它装进塑料袋当宠物
```

| 块 | 触发的前端行为 |
|---|---|
| `[DM_VISUAL]` | `dmExpressionMap` 关键词扫描 → 切换 Nyaa 精灵帧动画 |
| `[DIALOGUE]` | 按说话人前缀分发到对应气泡，`Typewriter` 打字机渲染 |
| `[GAME_STATE]` | 解析三行 KV → 写入 `worldStateStore`（Location 显示在场景顶栏，ActiveQuest 显示在任务面板，TableEvent 触发桌面事件 UI） |
| `[ACTION_PROMPT]` | 渲染 3-4 个像素按钮，玩家点击 → 作为下一轮 `userText` 发回 LLM |

DSL 详细规范（容错、转义、空块语义）见 `.docs/dsl-spec.md`（M3/M4 阶段补齐）。

## 调用链路（凭据从未出过浏览器）

```
玩家浏览器
  ├─ apiSettings (LocalStorage：LLM Provider/Key/Model)
  ├─ services/llm/dmSystemPrompt.ts → 固化 Nyaa 人格 + 骰子先行约束 + 四块输出契约
  ├─ services/llm/runDmTurn.ts      → 调用统一 LLM 接口（流式 + tool-use 多轮）
  └─ services/llm/api.ts            → 直连上游
       ├─ openai-兼容 → {base}/chat/completions  （qiny/openai/deepseek/gemini-oai/ollama）
       └─ anthropic   → {base}/v1/messages       （cache_control 注入）

LLM 调用工具时 → services/mcp/mcpApi.ts → /api/mcp（nginx 反代）→ NyaaChat-MCP
                                                            roll_dnd/roll_dice/roll_coc
                                                            crypto.randomInt 真随机
```

**重要**：
- 所有 LLM `apiKey` 只在 LocalStorage，每次随 body 发；**服务端不持久化任何 LLM 凭据**
- MCP `Bearer` 由 nginx 在转发时注入，**永不出现在前端 bundle 里**

## 云存档架构（M7）

### 网络拓扑

```
浏览器 → :3091 client (nginx)
              ├─ /              → SPA
              ├─ /api/mcp       → 反代 → h.hony-wen.com:3094 + Bearer 注入
              └─ /api/cloudsave → 反代 → cloudsave:5105 (docker 内网)

cloudsave (5105) 也对宿主直暴露，便于其他游戏跨域调用（CORS 白名单）
```

### Schema（game-agnostic）

```sql
users    (id, username UNIQUE, password_hash, created_at, last_login_at)
apps     (id, slug UNIQUE, name, created_at)              -- slug='dicedrama'
saves    (user_id, app_id, slot_id, label, data TEXT, version, updated_at,
          PRIMARY KEY (user_id, app_id, slot_id))
sessions (token, user_id, expires_at)
```

`saves.data` 一律 JSON 字符串，由客户端自定义结构。新游戏接入只需在自己 nginx 加 `/api/cloudsave/*` 反代 + 用自己的 `APP_SLUG`，后端会自动 upsert apps 表。

### REST v1

| 方法 | 路径 | 说明 |
|---|---|---|
| POST | `/v1/auth/register` | `{username, password}` → `{token, user}` |
| POST | `/v1/auth/login` | 同上 |
| POST | `/v1/auth/logout` | Bearer auth |
| GET | `/v1/auth/me` | 当前用户 |
| GET | `/v1/apps/:slug/slots` | `{slots: [{slotId, label, savedAt, sizeBytes}]}` |
| GET | `/v1/apps/:slug/slots/:slotId` | 完整存档 |
| PUT | `/v1/apps/:slug/slots/:slotId` | `{label, data, baseVersion?}`，乐观并发 |
| DELETE | `/v1/apps/:slug/slots/:slotId` | — |
| GET | `/healthz` | 不需鉴权 |

## 端口与镜像清单

| 服务 | 容器内 | 宿主端口 | 镜像名（registry：`h.hony-wen.com:5000`） | 目标大小 |
|---|---|---|---|---|
| 前端 client | nginx :80 | **3091** | `dicedrama-client:latest` | ≤ 40 MB |
| 云存档 cloudsave | node :5105 | **5105** | `cloudsave:latest`（不带 dicedrama 前缀） | ≤ 120 MB |

外部依赖端点：
- NyaaChat-MCP：`http://h.hony-wen.com:3094/mcp`（Bearer 鉴权，玩家无感）

## 关键文件地图（按"我要改 X 时去哪"组织）

```
client/src/services/llm/
  ├─ providers.ts        ← 多 Provider 数据模型（移植自 NyaaChat）
  ├─ api.ts              ← 统一 chat completion + tool-use 多轮
  ├─ chatPipeline.ts     ← 消息编排
  ├─ dmSystemPrompt.ts   ← Nyaa 人格 + 骰子先行 + 四块契约（M4 落地）
  └─ runDmTurn.ts        ← 顶层接口
client/src/services/mcp/
  ├─ mcpApi.ts           ← JSON-RPC over SSE（移植自 NyaaChat）
  └─ diceTools.ts        ← roll_dnd / roll_dice / roll_coc 工具描述
client/src/engine/
  ├─ parseSceneBlocks.ts ← 四块 DSL 解析器
  ├─ SceneRunner.ts      ← Scene 状态机
  └─ dmExpressionMap.ts  ← DMVisual → Nyaa 精灵帧动画映射
client/src/components/
  ├─ NyaaSprite.tsx      ← 8 表情精灵渲染器
  ├─ DiceRoller.tsx      ← 像素掷骰动画（结果由 MCP 决定）
  ├─ Typewriter.tsx      ← 打字机
  ├─ ChoicePanel.tsx     ← 3-4 选项按钮
  ├─ FantasyView.tsx     ← 奇幻冒险层
  └─ TableView.tsx       ← 现实围桌层
client/src/services/save/
  ├─ localSave.ts        ← LocalStorage 三槽
  ├─ cloudSave.ts        ← /api/cloudsave/v1 调用
  └─ syncManager.ts      ← 双轨合并（last-write-wins + 时间戳 + 乐观并发）
client/nginx.conf.template ← /api/mcp + /api/cloudsave 反代 + envsubst MCP_API_KEY
cloudsave-server/src/
  ├─ index.ts            ← Express 入口
  ├─ db.ts               ← better-sqlite3 migrations
  ├─ routes/auth.ts      ← register/login/logout/me
  └─ routes/saves.ts     ← apps/:slug/slots[/...]
```

## 必读规范文档（修改对应主题前先翻）

| 主题 | 文档 | 阶段 |
|---|---|---|
| 任务蓝图 / 阶段状态 | `.docs/BLUEPRINT.md` | 全程 |
| 代码签名（`Nyaa be with you.`） | `.docs/code-signature.md` | 全程 |
| DSL 输出契约 | `.docs/dsl-spec.md` | M3/M4 落地 |
| UI 配色铁律 | `.docs/UI-STYLE-GUIDE.md` | M5 落地 |
| MCP 工具规格 | `.docs/NyaaChat-MCP.md`（摘录） | M3 |
| 镜像构建 + 推送 | `.claude/skills/rebuild/SKILL.md` | M1 起 |
| git 提交规范 | `.claude/skills/commit-push/SKILL.md` | 全程 |
| 阶段完成同步流程 | `.claude/skills/sync-blueprint/SKILL.md` | 每阶段末尾 |

## 常见坑（容易踩、踩了贵）

1. **不要把 MCP Bearer 暴露到前端**。它由 nginx 在 envsubst 模板里注入，前端代码永远只调用同源 `/api/mcp`。
2. **不要让 LLM 自己编骰值**。system prompt 已强约束"必须先调 `roll_dnd` / `roll_dice`"，但仍要在前端解析 narrative 时检测可疑数字（如"我投了 17"但本回合没有 tool_call）→ 打 warn 并要求重投。
3. **不要往 cloudsave-server 加任何 dicedrama 特有字段**。它是 game-agnostic 的——所有业务字段全塞进 `saves.data` JSON。新游戏接入零代码改动。
4. **不要在 client 里硬编码 cloudsave 地址**。客户端永远调同源 `/api/cloudsave/*`，由 nginx 决定上游。便于将来切换部署形态。
5. **不要绕过 rebuild skill**。手动 `docker compose build` 会忘记打 commit tag，导致 registry 上只有 `latest` 没有版本回滚点。
6. **DSL 四块顺序固定**。`parseSceneBlocks` 容错"缺块"但**不容错"乱序"**——LLM 偶尔会把 `[ACTION_PROMPT]` 放最前面，要在 system prompt 里反复强调顺序。
7. **不要把 LLM 凭据写进 `.env`**。`.env` 只放 `MCP_API_KEY`（给 nginx envsubst 用）和 `JWT_SECRET`（给 cloudsave 用）。LLM Key 由用户自填到 LocalStorage。

## 快速 onboarding 流程（新会话开 5 分钟内完成）

1. 读本文（架构）+ `CLAUDE.md`（铁律）+ `.docs/BLUEPRINT.md`（当前阶段）
2. `git status` 看是否有未提交的改动
3. 看蓝图找当前 🟡 进行中里程碑的下一个 `- [ ]`
4. 动手前如果不确定就回头读对应里程碑详情；必要时用 EnterPlanMode 列计划
5. 完成后按 `.claude/skills/sync-blueprint/SKILL.md` 流程更新蓝图 + commit + push
