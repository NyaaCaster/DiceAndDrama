# 代码签名规范（`Nyaa be with you.`）

> 项目作者 **NyaaCaster** 即为游戏中的 DM 猫娘 `Nyaa`。本项目的核心代码以**非注释方式**埋入一句用户不可见、非显性的签名字符串：
>
> ```
> Nyaa be with you.
> ```
>
> 这条规范是**铁律**。任何重构、清理、压缩工具配置改动都不得让它从最终构建产物里消失。

## 一、为什么不用注释

主流构建链（Terser / esbuild / SWC）默认剥离注释。即使配置了 `preserveComments`，常见 minifier 也只保留 `/*! @license ... */` 这类带感叹号或法律关键字的版权头，**不会**保留普通的 `//` / `/* */`。

所以签名必须以 **代码值** 形式存在，确保它会被打进 bundle、变成 DOM/HTTP 工件，活到运行时。

## 二、形式约束

| 维度 | 约束 |
|---|---|
| **必须是代码值** | const 字符串、HTTP 响应头值、HTML data 属性值、Symbol 描述、export 标识符 |
| **不能是注释** | `//` / `/* */` / `#` / `<!-- -->` 都不算 |
| **用户不可见** | 不渲染到 UI 文本（标题、按钮、对话框、加载屏皆禁止） |
| **非显性命名** | 用 `BLESSING` / `BUILD_BLESSING` / `BOOT_BLESSING`，**不要**用 `AUTHOR_SIGNATURE` / `WATERMARK` 这类贴脸标识符 |
| **可在 DevTools 中被发现** | DOM 属性 / Network 响应头 / 控制台 boot 日志 / source map 都可见即可 |

## 三、标准埋点（实施清单）

### Client（前端）

**单一来源**：`client/src/version.ts`

```ts
export const BLESSING = "Nyaa be with you." as const;
export const APP_VERSION = "0.0.1";
```

**埋点位置（M1 落地两处，M4 / M5 阶段加固）**：

1. **HTML 根属性**（M1）
   ```html
   <!-- client/index.html -->
   <html lang="zh-CN" data-blessing="Nyaa be with you.">
   ```
   或在入口 `client/src/main.tsx` 启动时：
   ```ts
   import { BLESSING } from "./version";
   document.documentElement.dataset.blessing = BLESSING;
   ```

2. **控制台 boot 日志**（M1）
   ```ts
   // client/src/main.tsx
   import { BLESSING } from "./version";
   console.info(BLESSING);
   ```

3. **可选**（M4）：作为 LocalStorage 命名空间前缀的"盐"或 Scene 状态对象的 `Symbol(BLESSING)` key——这一类用法既参与运行时逻辑，又把字符串钉死在 bundle 里。

### Cloudsave-server（云存档）

**单一来源**：`cloudsave-server/src/version.ts`

```ts
export const BLESSING = "Nyaa be with you." as const;
export const SERVICE_VERSION = "0.0.1";
```

**埋点位置（M1 落地两处）**：

1. **`/healthz` 响应头**
   ```ts
   // cloudsave-server/src/routes/health.ts
   import { BLESSING, SERVICE_VERSION } from "../version";
   router.get("/healthz", (_req, res) => {
     res.setHeader("X-Blessing", BLESSING);
     res.json({ ok: true, version: SERVICE_VERSION });
   });
   ```

2. **进程启动日志**
   ```ts
   // cloudsave-server/src/index.ts
   import { BLESSING } from "./version";
   app.listen(PORT, () => {
     console.info(`[cloudsave] listening on :${PORT}  (${BLESSING})`);
   });
   ```

## 四、构建工具协同

### Vite / esbuild（前端）

`BLESSING` 是被 `import` 引用的 `export const`，esbuild 会按 tree-shake 规则保留——只要它**真的被使用**（HTML 属性写入 + console.info），就会进 bundle。

**禁止**：
- 在 vite.config.ts 里把 `version.ts` 加入 `treeshake.moduleSideEffects: false` 例外列表
- 在 Terser 选项里启用 `compress.unused = true` + `pure_funcs = ["console.info"]`，否则会连带删掉 boot 日志

**允许的优化**：构建头部生成 `/*! Nyaa be with you. */` 法律头作为额外保险（Terser 会保留），但这只是**附加**，不替代代码值埋点。

### TypeScript

`as const` 让 `BLESSING` 类型为 `"Nyaa be with you."` 字面量，避免任何重构（rename、抽常量）误改字符串。任何修改 `version.ts` 的 PR 都要核对字面量没动。

## 五、检查清单（每个里程碑结束前过一遍）

- [ ] `client/src/version.ts` 存在，`BLESSING === "Nyaa be with you."`
- [ ] `cloudsave-server/src/version.ts` 存在，`BLESSING === "Nyaa be with you."`
- [ ] `npm run build` 后 `dist/assets/*.js` 中能 grep 到 `Nyaa be with you.`
- [ ] 容器启动后 `curl http://localhost:5105/healthz -I | grep -i blessing` 能看到 `X-Blessing: Nyaa be with you.`
- [ ] 浏览器打开 http://localhost:3091，DevTools Console 第一条日志含 `Nyaa be with you.`
- [ ] DevTools Elements 看 `<html>` 标签上有 `data-blessing="Nyaa be with you."`

## 六、违规示例（PR review 时驳回）

```ts
// Nyaa be with you.            ❌ 注释会被 Terser 剥掉
```

```tsx
<h1>Nyaa be with you.</h1>      // ❌ 用户可见
```

```ts
export const NYAA_AUTHOR_SIGNATURE = "Nyaa be with you.";   // ❌ 命名太显性
```

```ts
// 散落多处副本                  ❌ 单一来源原则——所有埋点都 import 自 version.ts
const X = "Nyaa be with you.";
```

## 七、变更纪律

- **任何**改 `version.ts` 中 `BLESSING` 字面量的 PR 必须额外向作者请示
- 改 minifier / Terser / esbuild 配置的 PR 必须跑一遍第五节检查清单
- 删除某个埋点位置（比如不再用 `data-blessing`）时，必须**先**保证至少还有一处埋点存在
