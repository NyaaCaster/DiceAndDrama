---
name: rebuild
description: Rebuild a Dice & Drama Docker image (client or cloudsave-server), push to private registry h.hony-wen.com:5000, and restart the container locally. Use when the user asks to "rebuild", "重建镜像", or has changed Dockerfile / docker-compose.yml / nginx.conf.template / source files in client/ or cloudsave-server/. Always invokes the per-subproject rebuild.ps1 (Windows) or rebuild.sh (Linux/macOS) with -ExecutionPolicy Bypass on Windows.
---

# rebuild

Dice & Drama 是双仓项目，两个子目录各自独立维护镜像：

- `client/` → `h.hony-wen.com:5000/dicedrama-client:latest`
- `cloudsave-server/` → `h.hony-wen.com:5000/cloudsave:latest`

每个子目录都有自己的 `rebuild.ps1` / `rebuild.sh` 与 `update-and-restart.ps1` / `update-and-restart.sh`，**不要混用**。

## 触发场景

- 用户明确要求"重新编译"、"重建镜像"、"重启容器"、"rebuild"
- 改动了对应子目录的 `Dockerfile`、`docker-compose.yml`、`.dockerignore`、`nginx.conf.template`
- 改动了对应子目录的 `src/**`、`package.json` / `package-lock.json`、`tsconfig.json`、`vite.config.ts` 等会进入镜像的源码或构建配置
- 通过 `/rebuild` 显式调用

## 选择子目录

按改动文件的位置决定要 rebuild 哪个：

| 改动位置 | rebuild 子目录 |
|---|---|
| `client/src/**`、`client/Dockerfile`、`client/nginx.conf.template`、`client/package.json` | `client/` |
| `cloudsave-server/src/**`、`cloudsave-server/Dockerfile`、`cloudsave-server/package.json` | `cloudsave-server/` |
| 同时改了两边 | 先 `cloudsave-server/` 后 `client/`（前端依赖云存档健康） |

## 选择脚本

| 系统环境 | 脚本 | 调用方式 |
|---|---|---|
| Windows (`win32`) | `rebuild.ps1` | `powershell -ExecutionPolicy Bypass -File .\rebuild.ps1` |
| Linux / macOS / WSL | `rebuild.sh` | `bash ./rebuild.sh` |

判断依据优先级：
1. 环境信息中的 `Platform`（如 `win32` → PowerShell）
2. 当前可用的 shell

## 关于 `-ExecutionPolicy Bypass`

参数传给 **PowerShell 进程本身**（不是 `rebuild.ps1` 脚本的参数），临时绕过本机执行策略。

- 只对当前 powershell 进程生效，进程结束即失效；不修改注册表
- `rebuild.ps1` 是仓库内未签名脚本，默认 `Restricted` 策略下直接 `.\rebuild.ps1` 会报错；带上 `Bypass` 才能运行
- 不需要管理员权限
- 唯一无法覆盖的是组策略下发的策略

## 执行规则

- **必须**带 `-ExecutionPolicy Bypass` 跑 `rebuild.ps1`
- 用 `PowerShell` 工具（Windows）或 `Bash` 工具（Linux/macOS），不要混
- 完整命令示例：
  - Windows（client）：`powershell -ExecutionPolicy Bypass -File .\client\rebuild.ps1`
  - Linux（cloudsave）：`bash ./cloudsave-server/rebuild.sh`
- 脚本完成的事：`docker compose build`（带层缓存）→ `docker tag` 加 commit short hash → `docker push` 到 `h.hony-wen.com:5000` → 本机 `docker compose up -d` 起容器 → 清理 dangling 镜像
- 脚本通过 `-p dicedrama-client` 或 `-p cloudsave` 显式锁定 compose 项目名
- 执行前确认工作目录是项目根（含双子目录），脚本会自行 cd 进对应子目录
- 执行后向用户简要汇报：脚本是否成功结束、镜像是否成功 push、容器是否健康、对外端口与 URL（client → http://localhost:3091, cloudsave → http://localhost:5105/healthz）

## 关于缓存策略

脚本默认走 Docker 的层缓存（不带 `--no-cache`）：

- 多阶段 Dockerfile 第一层是 `COPY package.json package-lock.json ./` + `RUN npm ci`。只要 lockfile 没变，这一层秒级跳过
- `--no-cache` 全量重建时会从 npm registry 全量拉 tarball，遇网络抖动会失败
- Docker 层指纹按指令文本 + 上游层 + COPY 内容算，所以**改源码自然会让对应层失效**

什么时候确实需要 `--no-cache`：
- 怀疑 base image 自身脏
- 改了 npm 镜像源 / 私有 registry 配置
- 排查"为什么改了 X 镜像里没生效"

需要时临时手动加，**不要改脚本**：
```powershell
docker compose -p dicedrama-client -f client\docker-compose.yml build --no-cache
```

## 部署机更新流程（不是 rebuild）

部署机不重新构建，只 pull 已经推到 registry 的镜像：

```powershell
powershell -ExecutionPolicy Bypass -File .\client\update-and-restart.ps1
powershell -ExecutionPolicy Bypass -File .\cloudsave-server\update-and-restart.ps1
```

`update-and-restart` = `docker compose pull` + `up -d` + `image prune -f`。

## 不要做的事

- 不要绕过脚本直接调用 `docker compose build`/`up`/`down`——脚本能保证 push、tag、网络绑定流程一致
- 不要在 Windows 上用 `bash` 跑 `.sh`（除非用户指定 WSL/Git Bash）
- 不要省略 `-ExecutionPolicy Bypass`
- 不要随手 `docker system prune -a`——脚本只清 dangling 镜像，足够且安全
- 不要在两个子目录之间 cd 来 cd 去——脚本自己会处理路径
