# DiceAndDrama

> 《骰子与戏精》—— 基于《Knights of Pen and Paper 2》设计的像素风元 TRPG。由白色双马尾、暗红双瞳、蓝衣的猫娘 `Nyaa` 担任 DM，同时呈现"奇幻冒险"与"现实围桌吐槽"两层叙事。

## 仓库结构

```
DiceAndDrama/
├─ client/                 ← 前端容器（Vite + React 19 + Tailwind 4 + nginx-alpine）
├─ cloudsave-server/       ← 通用云存档子服务容器（Express + better-sqlite3 + bcrypt）
├─ .docs/                  ← 项目蓝图、规范文档
│  ├─ BLUEPRINT.md         ← 任务蓝图（M0–M8 状态）
│  └─ .work/PROJECT-OVERVIEW.md  ← 架构快照（开新会话先读）
├─ .claude/skills/         ← Claude Code 工作流 skill
└─ .ref/                   ← 灵感参考资料（**不入 git**）
   ├─ pic/                 ← 设计参考图
   └─ kopp2_rf/            ← KoPP2 反编译机制分析（M4/M6/M8 借鉴依据）
```

## 端口与镜像

| 服务 | 端口 | 镜像（registry：`h.hony-wen.com:5000`） |
|---|---|---|
| 前端 client | 3091 | `dicedrama-client:latest` |
| 云存档 cloudsave | 5105 | `cloudsave:latest`（game-agnostic，可跨游戏复用） |

外部依赖：
- NyaaChat-MCP：`http://h.hony-wen.com:3094/mcp`（项目内 nginx 反代隐藏 Bearer，玩家无感）

## 部署流程

### 一次性准备

```powershell
# 创建 docker 共享网络（client 与 cloudsave 通过它互通）
docker network create dicedrama-net

# 配置 docker daemon 信任私有 registry（如未配置）
# Linux: /etc/docker/daemon.json 加 "insecure-registries": ["h.hony-wen.com:5000"]
# Windows: Docker Desktop → Settings → Docker Engine → 同上 JSON 字段
# 鉴权（如 registry 启用了登录）
docker login h.hony-wen.com:5000

# 复制 .env 模板并填入秘密
Copy-Item client\.env.example client\.env                       # 填 MCP_API_KEY
Copy-Item cloudsave-server\.env.example cloudsave-server\.env   # 按需填 ALLOWED_ORIGINS
```

### 开发机：构建并推送镜像

```powershell
# 构建 + push 云存档（先做，前端 nginx 反代到它的 docker 内网名 cloudsave）
powershell -ExecutionPolicy Bypass -File .\cloudsave-server\rebuild.ps1

# 构建 + push 前端
powershell -ExecutionPolicy Bypass -File .\client\rebuild.ps1
```

`rebuild.ps1` / `rebuild.sh` 都支持 `-NoPush` / `--no-push`（registry 不可达时只本机 build + up）。

### 部署机：拉取镜像并重启

```powershell
powershell -ExecutionPolicy Bypass -File .\cloudsave-server\update-and-restart.ps1
powershell -ExecutionPolicy Bypass -File .\client\update-and-restart.ps1
```

### 验证

```bash
curl -I http://localhost:3091/                          # 前端 SPA：200
curl    http://localhost:3091/api/cloudsave/healthz     # nginx → cloudsave docker 内网：200
curl    http://localhost:3091/api/mcp/health            # nginx → MCP 上游：200
curl -I http://localhost:5105/healthz                   # cloudsave 直连：响应头含 X-Blessing
```

## 给 Claude Code 的入口

每次开新会话先读：

1. `.docs/.work/PROJECT-OVERVIEW.md` — 架构快照
2. `CLAUDE.md` — 项目铁律
3. `.docs/BLUEPRINT.md` — 当前阶段与未完成项

skill 入口：

| skill | 用途 |
|---|---|
| `rebuild` | 重建任一子项目镜像 + 推 registry + 重启容器 |
| `commit-push` | git 提交 + 推送（Conventional Commits） |
| `sync-blueprint` | 完成阶段后同步蓝图 + 架构快照 + 推送 |

## License

待定（项目处于 M0 治理阶段）。
