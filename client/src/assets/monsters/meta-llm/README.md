# Meta-LLM 怪物图鉴（超游入侵者）

> M5 像素美术阶段的"私房菜"——把 6 家 LLM 厂商的官方 logo 改造为 Nyaa 一眼误认的二次元/克苏鲁式怪物。
> 这一批是**元 TRPG 的喜剧支柱**：玩家和 Nyaa 隔着次元壁吵架，AI 厂商成了 Boss 战。

## 命名空间

- 路径：`client/src/assets/monsters/meta-llm/`
- 与 M5 正经怪物（史莱姆/骷髅/哥布林/蝙蝠/巨鼠/巫师/龙/Boss）**分目录隔离**，避免风格混淆
- 怪物 id 一律 kebab-case，目录名 = id

## 资产清单

| id | 形态 | tier | 帧数 | Nyaa 误认 |
|---|---|---|---|---|
| `claude-octopus` | 像素艺术 SVG | boss | 4 | 克苏鲁旧日支配者 |
| `gemini-angel` | 矢量 SVG | elite | 1 | Eva 第五使徒（拉米尔） |
| `openai-sharingan` | 矢量 SVG | elite | 1 | 万花筒写轮眼 |
| `grok-blackhole` | 矢量 SVG | elite | 1 | X 空间黑洞 |
| `deepseek-kun` | 矢量 SVG | elite | 1 | 北冥之鲲 |
| `ollama-mole` | 矢量 SVG | mob | 1 | 地鼠（打地鼠玩法） |

## 风格取向（为什么 5 张 SVG 是矢量而不是像素）

- **设计目标**：超游怪物要"格格不入"地从像素背景里突出来——这是元 TRPG 的喜剧节拍，不是 bug
- **Claude 章鱼例外**：Anthropic 是本项目 IDE 主场（Claude Code），它必须是"像素风原住民"，不能突出
- **像素艺术 SVG**：viewBox `0 0 64 64` + 1×1 `<rect>` 网格 + `shape-rendering="crispEdges"`，渲染端配 CSS `image-rendering: pixelated` 即可获得硬边像素效果，文件可读、可 diff、可手工改

## 引用方式

```ts
// 静态 import（vite 自动处理）
import claudeOctopus0 from "@/assets/monsters/meta-llm/claude-octopus/claude-octopus.svg";
import geminiAngel from "@/assets/monsters/meta-llm/gemini-angel/gemini-angel.svg";

// 章鱼 4 帧动画（每 200ms 切换）
const FRAMES = [claudeOctopus0, claudeOctopus1, claudeOctopus2, claudeOctopus3];

// 像素图必须加 image-rendering: pixelated
<img src={claudeOctopus0} className="image-pixelated" alt="Claude 章鱼" />
```

矢量 SVG 不需要 `image-rendering: pixelated`，它们的"格格不入"来自抗锯齿曲线 vs 像素硬边的对比。

## banter.yaml schema

```yaml
monsterId: <kebab-case>
nyaaMisidentification: <Nyaa 一眼误认的对象>
encounter:        # 怪物登场即喊（1-3 条）
  - text: <string>
    expressionKey: <8-key 字典之一>
midBattle:        # 战斗中穿插（1-3 条）
  - text: <string>
    expressionKey: <8-key 字典之一>
defeat:           # 击败定格（1-3 条）
  - text: <string>
    expressionKey: <8-key 字典之一>
```

`expressionKey` 必须是 `client/src/engine/dmExpressionMap.ts` 中 8 key 之一：
`default / eye-roll / ear-twitch / donut / petting-cat / surprised / smug / sleepy`

未来 M6 战斗系统会随 `monster-encountered` 事件读取这些台词，作为 `userText` 注入下一回合 prompt。

## 版权边界（M8 公开发行前回看）

直接复用 6 家厂商官方 logo 配色 + 形状作为可被攻击的怪物，处于"商标戏仿/评论"的灰区。元 TRPG 个人项目阶段问题不大；M8 公开发行前建议过一遍 stylized homage（形似而非逐像素复制），尤其：

- Gemini / OpenAI / Grok / DeepSeek / Ollama 的几何骨架可保留，但每张图都已加入"邪气化细节"（拉米尔护盾片 / 红 tomoe / 事件视界 / 咀嚼粒子 / 地洞），强化"是怪物而非品牌图标"的语境
- Claude 章鱼是项目自原创（Claude Code 欢迎界面那只橙章鱼的二次像素化）

## 不在本批次范围

- 怪物 HP / AC / 攻击数值表（M6 战斗平衡）
- 战斗 UI 引用（M6）
- M5 正经像素怪（史莱姆等）
- 美术 manifest.json 总索引（M5 启动时统一 `client/src/assets/pixel/manifest.json`）
