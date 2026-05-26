# DiceAndDrama

基于《Knights of Pen and Paper 2》设计的像素风元 TRPG 游戏，由白色双马尾、暗红双瞳、蓝衣的猫娘 `Nyaa` 担任 DM；同时呈现"奇幻冒险"与"现实围桌吐槽"两层叙事。

> **每次开新会话先读** `.docs/.work/PROJECT-OVERVIEW.md`（架构快照）+ `.docs/BLUEPRINT.md`（当前阶段）+ 本文。

## 交流语言

默认始终以**简体中文**与用户交流，除非用户在某次对话中明确要求改用其他语言。

- 适用范围：所有面向用户的文字输出（解释、总结、提问、错误说明等）
- 代码、标识符、命令行参数、文件路径、提交信息等仍按惯例使用英文
- 即使用户的某条消息使用了英文，默认回复仍使用简体中文

## 项目铁律（违反 = 砸架构）

### 1. LLM 凭据从不离开浏览器

所有 LLM Provider Key 只存在浏览器 LocalStorage，每次请求随 body 一起发送。**服务端不持久化任何 LLM 凭据**，也不读 `process.env.GEMINI_API_KEY` 之类的旧式启动密钥。新增供应商时，扩展 `client/src/services/llm/providers.ts` 的 `LlmProviderKind` 与 `services/llm/api.ts` 的分发逻辑。

### 2. MCP Bearer 永不进前端 bundle

NyaaChat-MCP 的 `Authorization: Bearer ...` 由 `client/nginx.conf.template` 在 envsubst 时注入，前端代码只调用同源 `/api/mcp`。**禁止**在前端 LocalStorage、源码、构建产物中出现 MCP Token。

### 3. 骰值由 MCP 真随机决定，LLM 不可编造

任何检定走 NyaaChat-MCP 的 `roll_dnd` / `roll_dice` / `roll_coc`。system prompt 已强约束"必须先调用工具拿到骰值再叙事"。前端在渲染 narrative 时如果检测到可疑数字而本回合没有 tool_call，打 warn 并要求重投。

### 4. 四块 DSL 输出契约不可破

LLM 每轮严格输出 `[DM_VISUAL]` / `[DIALOGUE]` / `[GAME_STATE]` / `[ACTION_PROMPT]` 四块，**顺序固定**。规范见 `.docs/dsl-spec.md`，解析器在 `client/src/engine/parseSceneBlocks.ts`。

### 5. cloudsave 必须 game-agnostic

`cloudsave-server` 是通用跨游戏存档服务，按 `apps.slug` 隔离不同游戏。**禁止**在 schema 或 API 里硬编码 dicedrama 特有字段——业务数据全塞进 `saves.data` JSON。新游戏接入零代码改动。

### 6. 镜像优先小

| 镜像 | 目标 | 优化要点 |
|---|---|---|
| `dicedrama-client:latest` | ≤ 40 MB | nginx-alpine + 仅 dist/ + 删 nginx 默认配置 + tzdata 用后即删 |
| `cloudsave:latest` | ≤ 120 MB | node-alpine + `--omit=dev` + 删 `*.md` `LICENSE` `CHANGELOG` `*.d.ts` `*.map` + 非 root USER |

构建走多阶段缓存（`--mount=type=cache,target=/root/.npm`）；本机 build → push `h.hony-wen.com:5000` → 部署机 pull 更新。

### 7. 端口分配

- **3091** → 前端 client（nginx）
- **5105** → 云存档 cloudsave（Express）
- 其他外部端点：MCP 服务 `h.hony-wen.com:3094`（项目内反代，玩家无感）

### 8. 代码签名 `Nyaa be with you.`

项目作者 NyaaCaster 即游戏中的 DM 猫娘 `Nyaa`。**核心代码必须以非注释方式埋入字符串 `Nyaa be with you.`**——这是用户不可见的非显性签名。

- `client/` 与 `cloudsave-server/` 各自 `src/version.ts` 导出 `export const BLESSING = "Nyaa be with you." as const;`，作为单一来源
- 至少要有 2 处运行时可见的埋点：HTML `data-blessing` 属性 / 控制台 boot 日志 / HTTP 响应头 `X-Blessing` / Symbol 描述等
- **禁止**：写成 `//` 注释（会被 Terser 剥掉）；渲染到玩家可见的 UI 文本；用 `AUTHOR_SIGNATURE` / `WATERMARK` 这类贴脸命名
- 修改 minifier / Terser / esbuild 配置或 `version.ts` 字面量前，必读 `.docs/code-signature.md` 的检查清单

### 9. KoPP2 借鉴只许"重写"，不许"照抄"

`.ref/kopp2_rf/` 是 KoPP2 反编译得到的机制总结，**不入 git**，仅供本机参考。M4/M6/M8 落地时可以借鉴公式、枚举骨架、架构思路，但所有代码、文案、数值、美术都要按本项目语境**重写**。

- ✅ 允许借鉴：经验曲线 `level² × 30 + 30`、22 种 SkillTriggerType 的 hook 模式、StatsCenter 的事件总线模式
- ❌ 禁止：抄 C# 源码字面表达、抄对白文案、抄技能/物品描述文本、抄美术/音频资产、抄具体数值表
- 详细规则见 `.docs/BLUEPRINT.md` 第六节"外部参考与版权边界"

## API / 模型供应商架构

LLM 配置由用户在前端"设置"面板填入，凭据存浏览器 LocalStorage，每次请求随 body 一起发到后端。**服务端不持久化任何 API Key**。

`client/src/services/llm/api.ts` 的 `dispatchLlm` 根据 `provider` 动态分发：

| Provider | 路径 | 格式 |
|---|---|---|
| `qiny` / `openai` / `deepseek` / `gemini` / `ollama` / `custom` | `{base}/chat/completions` | OpenAI 兼容（`response_format: json_object`） |
| `anthropic` | `{base}/v1/messages` | Anthropic 原生（含 cache_control） |

新增 Provider 时务必同步：`providers.ts` 的预设、`api.ts` 的分发分支、设置面板的图标与中文标签。

## Docker 部署约定

- **多阶段构建**：`node:20-alpine` 作 builder 跑 `npm ci` + `npm run build`，再 copy 到一个干净的 runtime（前端 nginx-alpine，后端 node-alpine）
- **compose 项目名**：`dicedrama-client` 与 `cloudsave`，由 rebuild 脚本通过 `-p` 显式锁定
- **共享网络**：`docker network create dicedrama-net`（一次性，外部 external 模式）
- **持久化**：cloudsave 的 sqlite 文件挂在 docker volume `cloudsave_data:/app/data`
- **镜像分发**：本机 build → tag latest + commit short hash → push `h.hony-wen.com:5000`；部署机 `docker compose pull` + `up -d`

## 重新编译 Docker 镜像（rebuild skill）

每当本项目需要重建镜像并重启容器（包括但不限于：用户明确要求 rebuild；改动了 `Dockerfile` / `docker-compose.yml` / `nginx.conf.template`；改动了 `client/src/**` 或 `cloudsave-server/src/**` 等会进入镜像的源码或构建配置），必须通过 `rebuild` skill 来执行，不要手动拼 `docker compose` 命令。

- Windows：`powershell -ExecutionPolicy Bypass -File .\rebuild.ps1`（每个子项目目录下都有）
- Linux/macOS：`bash ./rebuild.sh`
- `-ExecutionPolicy Bypass` 在 Windows 下**必须**带上
- 详细规则见 `.claude/skills/rebuild/SKILL.md`

## Git 提交与推送（commit-push skill）

每当用户明确要求"提交"、"commit"、"推送"、"push"、"上传到 GitHub"等，使用 `commit-push` skill 完成。要点：

- **未经用户明确请求，绝不自动 commit / push**
- 提交信息使用 **Conventional Commits**（英文，小写起首）；**不**附加 `Co-Authored-By` 行
- 始终用 `git add <file>` 明确指定文件，**禁止** `git add -A` / `git add .`
- `.env`（含 `MCP_API_KEY` / `JWT_SECRET`）、`.claude/settings.local.json`、`node_modules`、`dist` **绝不入库**——已在 `.gitignore` 中排除
- 严禁：force push、`--amend` 已推送的 commit、`--no-verify`、修改 `git config`、`reset --hard` 等高破坏性操作（除非用户显式同意）
- 远端仓库：`https://github.com/NyaaCaster/DiceAndDrama.git`，主分支 `master`
- 详细规则见 `.claude/skills/commit-push/SKILL.md`

## 阶段完成同步（sync-blueprint skill）

每完成一个里程碑（M1–M8），必须：

1. 在 `.docs/BLUEPRINT.md` 中把对应里程碑的 `- [ ]` 勾选为 `- [x]`，状态符号换成 ✅
2. 若改动了调用链路、关键契约、关键文件地图，同步更新 `.docs/.work/PROJECT-OVERVIEW.md`
3. 通过 `commit-push` skill 推到 origin master
4. M2/M4/M6/M7/M8 完成时打 tag `m2-llm-ready` / `m4-engine-ready` 等

详细规则见 `.claude/skills/sync-blueprint/SKILL.md`。
