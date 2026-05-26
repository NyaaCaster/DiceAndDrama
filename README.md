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
└─ .ref/pic/               ← 设计参考图
```

## 端口与镜像

| 服务 | 端口 | 镜像（registry：`h.hony-wen.com:5000`） |
|---|---|---|
| 前端 client | 3091 | `dicedrama-client:latest` |
| 云存档 cloudsave | 5105 | `cloudsave:latest`（game-agnostic，可跨游戏复用） |

外部依赖：
- NyaaChat-MCP：`http://h.hony-wen.com:3094/mcp`（项目内 nginx 反代隐藏 Bearer，玩家无感）

## 部署流程

### 一次性准备（部署机）

```powershell
# 创建 docker 共享网络（client 与 cloudsave 通过它互通）
docker network create dicedrama-net

# 配置 docker daemon 信任私有 registry（如未配置）
# Linux: /etc/docker/daemon.json 加 "insecure-registries": ["h.hony-wen.com:5000"]
# Windows: Docker Desktop → Settings → Docker Engine → 同上 JSON 字段
```

### 开发机：构建并推送镜像

```powershell
# 构建 + push 云存档（先做，因为前端 nginx 反代依赖它）
powershell -ExecutionPolicy Bypass -File .\cloudsave-server\rebuild.ps1

# 构建 + push 前端
powershell -ExecutionPolicy Bypass -File .\client\rebuild.ps1
```

### 部署机：拉取镜像并重启

```powershell
powershell -ExecutionPolicy Bypass -File .\cloudsave-server\update-and-restart.ps1
powershell -ExecutionPolicy Bypass -File .\client\update-and-restart.ps1
```

访问：http://localhost:3091

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
