---
name: commit-push
description: Create a git commit and optionally push to origin/master for the DiceAndDrama project. Trigger when the user explicitly asks to commit, push, "提交", "推送", or "上传到 GitHub". Follows Conventional Commits (English) style, never auto-commits without an explicit request, and refuses destructive operations (force-push, --no-verify, --amend on pushed commits, git config changes).
---

# commit-push

为 **DiceAndDrama** 项目执行 `git commit` 以及可选的 `git push origin master`。

> 远端仓库：`https://github.com/NyaaCaster/DiceAndDrama.git`，主分支 `master`。
> 仓库初次 init 时由 M0 任务一并完成，本 skill 假设 git 已就绪。若 `git status` 报 "not a git repository"，停下来与用户确认要不要 `git init` 并设置远端，**不要擅自 init**。

## 触发条件

**只在用户明确要求时调用**，例如：

- "帮我提交"、"commit 一下"、"提交这些改动"
- "推送到 GitHub"、"push 到远端"、"上传"
- 显式调用 `/commit-push`
- 完成了一个里程碑后用户要求"同步进度"

**严禁**在用户没有明确要求的情况下自动 commit 或 push——哪怕本轮对话刚改完一堆代码。

## 提交信息风格（Conventional Commits，英文）

| 类型 | 含义 |
|---|---|
| `feat:` | 新功能或增强 |
| `fix:` | bug 修复 |
| `chore:` | 构建、配置、辅助脚本等非业务改动 |
| `docs:` | 仅文档变动（README、注释除外） |
| `refactor:` | 不改变行为的重构 |
| `style:` | 仅样式 / 排版改动 |
| `init:` | 仅初始化提交时使用 |
| `build:` | Docker / CI / 镜像 / 构建脚本变动 |

写作规则：
- 主语全部使用**英文**
- `type:` 后跟空格和小写起首的简短描述
- 多项改动可用逗号合并到一行
- 主语短小（≤ 72 字符）；如需详述，在空行后写正文
- **不附加 `Co-Authored-By` 行**——与本项目无水印风格一致

仓库初始风格参考（M0/M1 阶段）：
```
init: scaffold dicedrama monorepo with blueprint and skills
build: scaffold client docker pipeline (vite + nginx-alpine)
build: scaffold cloudsave-server docker pipeline (express + sqlite + bcrypt)
chore: add docker network dicedrama-net to compose files
```

后续阶段示例：
```
feat: port nyaachat llm adapter into client/services/llm
feat: parse four-block dsl scenes (dm_visual, dialogue, game_state, action_prompt)
feat: nyaa pixel sprite with 8 expression frames
```

## 标准流程

### 1. 提交前侦查（并行执行）

```
git status
git diff
git diff --cached
git log --pretty=format:"%h %s" -n 5
```

目标：
- 看清将要进入提交的全部改动
- 确认风格与近邻 commit 一致
- 发现意外文件（见下方"绝不提交"）

### 2. 暂存

- **始终按文件名显式 `git add <file> <file>`**，禁止 `git add -A` / `git add .` / `git add -u`
- 用户已手动 `git add` 过的，直接沿用，不重复加

### 3. 起草提交信息

- 按上节风格起草，先看 `git log` 协调动词、大小写、用词
- 描述聚焦"为什么"和"带来什么"，而非逐文件罗列
- 多行信息**必须**用 HEREDOC 传入：

```bash
git commit -m "$(cat <<'EOF'
feat: short subject line

Optional body explaining the why.
EOF
)"
```

### 4. 推送（仅在用户要求时）

- 默认目标：`origin master`（除非用户指定其它分支）
- 推送前**必须**与用户二次确认，特别是包含：构建配置、`Dockerfile`、`docker-compose.yml`、依赖锁文件、大量删除
- 标准命令：`git push origin master`（首次推送可加 `-u` 设置上游）
- 推送完成后跑一次 `git status` 验证本地与远端一致

### 5. 同步阶段蓝图（如适用）

如果本次提交完成了一个里程碑，按 `sync-blueprint` skill 同时更新 `.docs/BLUEPRINT.md` 与 `.docs/.work/PROJECT-OVERVIEW.md`，把蓝图改动一并 commit。

## 处理 LF/CRLF 警告

`git add` 时如果出现：

```
warning: in the working copy of '...', LF will be replaced by CRLF the next time Git touches it
```

这是 Windows 下 git 默认 `core.autocrlf=true` 在提交时自动转换换行的提示。**不要忽略**，按下面流程一次性处理掉，保持项目清洁：

### 1. 检查仓库根是否有 `.gitattributes`

如果**没有**，创建一份钉死换行风格（项目级，跨机协作用）：

```gitattributes
# Default: text files normalized to LF in the repo
* text=auto eol=lf

# Explicit text types (defensive)
*.md       text eol=lf
*.ts       text eol=lf
*.tsx      text eol=lf
*.js       text eol=lf
*.json     text eol=lf
*.yml      text eol=lf
*.yaml     text eol=lf
*.css      text eol=lf
*.html     text eol=lf
*.sh       text eol=lf
*.conf     text eol=lf
*.env*     text eol=lf

# Windows-only scripts must keep CRLF
*.ps1      text eol=crlf
*.bat      text eol=crlf
*.cmd      text eol=crlf

# Binary
*.png      binary
*.jpg      binary
*.jpeg     binary
*.webp     binary
*.gif      binary
*.ico      binary
*.woff     binary
*.woff2    binary
*.ttf      binary
*.otf      binary
*.sqlite   binary
```

### 2. 重新规范现有文件的换行

```powershell
# 让所有已暂存文件按新规则重新被识别
git rm -r --cached . --quiet
git add <被首次添加的文件们...>
```

> 仓库刚 `git init`、还没有任何 commit 时，可以跳过 `git rm --cached`，直接 `git add` 即可（`.gitattributes` 会在 stage 时生效）。

### 3. 把 `.gitattributes` 一并加入首次提交

之后再 `git add` 不会再有这条警告。如果零星某个新文件还报，是因为 `.gitattributes` 没覆盖到该扩展名——补一行规则、重新 add。

### 不要做的事

- ❌ 不要 `git config --global core.autocrlf false`——那是改用户全局环境，影响其他项目
- ❌ 不要 `git add --renormalize .`——虽然能修，但会跨大量文件，不利于"显式按文件 add"原则
- ❌ 不要往单个文件里手动塞 LF/CRLF——靠 `.gitattributes` 统一管

如 `git status` 显示这些文件出现在暂存区或未跟踪区，**先停下询问用户**：

- `.env`、`.env.*`（已被 `.gitignore` 排除，例外是 `.env.example`）
  - 含 `MCP_API_KEY`、`JWT_SECRET` 等敏感值，**绝不**入库
- 任何含 token / API key / 密码字面值的文件
- `node_modules/`、`dist/`、`build/`、`coverage/`、`*.log`（已被 `.gitignore` 排除）
- `cloudsave-server/data/*.sqlite`（运行时产物）
- `.claude/settings.local.json`（每用户私有）
- 大体积二进制（> 5 MB），除非用户确认（参考图 `.ref/pic/*` 是已经入库的合法资产）
- 含 IDE 配置、临时调试代码、个人路径的文件

## 绝不做的操作

未经用户**显式书面同意**前：

- ❌ `git push --force` / `--force-with-lease` 到 `master`
- ❌ `git commit --amend`（尤其已推送的提交）
- ❌ `git reset --hard` / `git checkout .` / `git clean -fd`
- ❌ `git rebase`（任何形式）
- ❌ `--no-verify`、`--no-gpg-sign`
- ❌ 修改 `git config`（用户名、邮箱、远端、hooks）
- ❌ 删除分支 / 标签

遇到 pre-commit hook 失败，**不要**用 `--amend` 修复——先解决 hook 报的问题，重新 `git add` 后**新建** commit。

## 创建 Pull Request（如适用）

本项目当前预期单分支直推；如用户改用 PR 流程：

1. 新建特性分支：`git checkout -b feat/<short-name>`
2. 提交、推送：`git push -u origin feat/<short-name>`
3. 用 `gh pr create` 创建 PR，标题用 Conventional Commits 风格，body 用 HEREDOC
4. PR body 不附加 "🤖 Generated with Claude Code" 之类水印

## 给用户的最终汇报

成功 commit / push 后简短汇报：

- 提交哈希前 7 位和主语
- 是否已推送、本地与远端状态是否一致
- 任何被跳过的文件以及原因
- 若同步了蓝图，附上当前阶段进度
