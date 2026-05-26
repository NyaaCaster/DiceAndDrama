---
name: sync-blueprint
description: Update DiceAndDrama project blueprint after completing a milestone (M0-M8). Mark checklist items done in .docs/BLUEPRINT.md, append to changelog, sync architecture snapshot in .docs/.work/PROJECT-OVERVIEW.md if call paths/contracts/file map changed, then hand off to commit-push skill. Trigger when the user says "完成阶段", "更新蓝图", "M? 做完了", or after the last subtask of a milestone.
---

# sync-blueprint

每完成一个里程碑（M0–M8）必须走的同步流程，确保蓝图、架构快照、git 远端三者一致。

## 触发条件

- 用户明确说"M1 做完了"、"完成阶段"、"更新蓝图"
- 蓝图里某个里程碑的所有 `- [ ]` 都已实际完成
- 通过 `/sync-blueprint` 显式调用

**注意**：如果用户说"完成"但你判断里程碑还有未做项，**先停下询问**，不要擅自勾选。

## 标准流程

### 1. 核对完成状态

并行做这几件事：

- 读 `.docs/BLUEPRINT.md` 找当前 🟡 进行中的里程碑
- `git diff` / `git log` 看实际改动范围
- 对照里程碑的"完成判定"段落，逐项核对

如果有任何未完成项 → **停下，列出未完成项，问用户怎么办**（继续做 / 推迟 / 改判定）。

### 2. 更新蓝图（`.docs/BLUEPRINT.md`）

```markdown
### M1 · 双仓地基 + 镜像分发 ✅  _完成于 2026-MM-DD_

**目标**：...（保持原文不变）

- [x] 创建 `client/`：...
- [x] 创建 `cloudsave-server/`：...
- [x] ...
```

要做的修改：
- 标题状态符号从 ⬜/🟡 改为 ✅，并追加 `_完成于 YYYY-MM-DD_`
- 把所有子项的 `- [ ]` 改为 `- [x]`
- **不要**修改"目标"和"完成判定"段落（那是契约，事后证据）
- 在文末"六、变更日志"表格里追加一行：

| 日期 | 变更 | 关联 commit |
|---|---|---|
| 2026-MM-DD | M1 完成：双仓地基 + 镜像分发上线 | _待 commit 后填 hash_ |

### 3. 同步架构快照（`.docs/.work/PROJECT-OVERVIEW.md`）

判断本次里程碑是否影响了下列内容：

| 影响项 | 该不该改 PROJECT-OVERVIEW |
|---|---|
| 调用链路（浏览器 → LLM → MCP / cloudsave） | 必须改 |
| DSL 输出契约（四块结构、字段语义） | 必须改 |
| 关键文件地图 | 必须改 |
| Schema（cloudsave 数据库结构） | 必须改 |
| 端口分配 / 镜像名 / 镜像大小目标 | 必须改 |
| 必读规范文档清单 | 必须改 |
| 常见坑（新增的） | 必须追加 |
| 仅是新功能/UI/文案/像素图 | 可豁免 |

豁免时在 commit message 里显式写一句"PROJECT-OVERVIEW 无需同步"。

### 4. 启动下一里程碑

- 把蓝图里下一个 ⬜ 里程碑的状态符号改为 🟡（如适用）
- 不要勾选下一里程碑的子项

### 5. 提交并推送

调用 `commit-push` skill：

- 暂存：`git add .docs/BLUEPRINT.md .docs/.work/PROJECT-OVERVIEW.md` + 本次里程碑相关文件
- 提交信息样式：

```
docs: mark m1 complete in blueprint

M1 deliverables:
- client/ + cloudsave-server/ scaffolded
- multi-stage docker images push to h.hony-wen.com:5000
- rebuild + update-and-restart scripts on both subprojects
- nginx reverse proxy for /api/mcp and /api/cloudsave

Next: M2 (port llm adapter from nyaachat).
```

或者更简洁的形式（多文件混合提交时）：

```
feat: scaffold dicedrama monorepo

- M1 milestone deliverables (see .docs/BLUEPRINT.md)
- closes M1
```

- 推送前问用户："本次推送会包含 X 个文件改动 + 蓝图 M? 完成标记，是否推到 origin master？"
- 推送后回填变更日志的 commit hash（**新建一个小提交** 或下一次提交时一并修，**不要 amend**）

### 6. 代码签名校验（每个里程碑都跑）

完成里程碑前过一遍 `.docs/code-signature.md` 第五节检查清单，**任意一项不通过即视为里程碑未完成**：

- `client/src/version.ts` 与 `cloudsave-server/src/version.ts` 中 `BLESSING === "Nyaa be with you."`
- `npm run build` 后 `client/dist/assets/*.js` 中能 grep 到 `Nyaa be with you.`
- 容器启动后 `curl http://localhost:5105/healthz -I | grep -i blessing` 能看到 `X-Blessing: Nyaa be with you.`
- 浏览器打开 http://localhost:3091，DevTools Console 第一条日志含 `Nyaa be with you.`
- DevTools Elements 看 `<html>` 上有 `data-blessing="Nyaa be with you."`

构建配置（Vite / Terser / esbuild）改动过的里程碑**必须**跑这一步，不能跳过。

### 7. 给里程碑打 tag（仅 M2 / M4 / M6 / M7 / M8）

```bash
git tag -a m4-engine-ready -m "M4 complete: dsl engine + nyaa expression"
git push origin m4-engine-ready
```

tag 名规范：`m<编号>-<关键字>-ready`（小写、连字符）。

M0 / M1 / M3 / M5 不打 tag——它们是基础设施 / 资产层，回滚价值低。

## 与 code-signature 的关系

签名 `Nyaa be with you.` 的检查是**每个里程碑都要过**的硬门槛——它不是一个独立 skill，而是 sync-blueprint 第 6 步内嵌的检查清单。如果某个里程碑明显没碰构建/前端入口/cloudsave 入口（比如纯像素美术或纯剧本内容），可在提交对话里显式说"M? 未触及签名埋点位置，跳过 6.1-6.5 检查"，但跳过判断必须由维护者做、不能默认。

## 与 commit-push 的关系

- `sync-blueprint` 包含了 `commit-push`，但额外承担**蓝图与架构快照同步**职责
- 只是普通改动 → 用 `commit-push`
- 完成里程碑的提交 → 用 `sync-blueprint`（它会自己调 commit-push）

## 失败兜底

如果某一步失败：

| 失败 | 处理 |
|---|---|
| 蓝图改完后发现还有遗漏子项 | 用 `git checkout .docs/BLUEPRINT.md` 撤销，回到核对环节 |
| 架构快照写错 | 同上方式撤销，重新评估范围 |
| commit 后想改 message | **不要** `--amend`；写一个 `docs: clarify m1 commit summary` 的小补丁 |
| push 被拒绝（非 fast-forward） | 停下问用户，**不要** force push |

## 不要做的事

- 不要勾选未实际完成的子项——这会让蓝图与现实脱钩
- 不要在同一 commit 里同时跨多个里程碑（一次只完成一个 M）
- 不要把蓝图改动和无关 feature 放进同一 commit
- 不要省略变更日志表格的追加
