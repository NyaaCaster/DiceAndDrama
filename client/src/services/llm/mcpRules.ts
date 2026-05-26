/**
 * MCP 工具数据使用准则。Dice & Drama 仅启用 NyaaChat-MCP 的骰子族
 * （roll_dnd / roll_coc / roll_dice），其余族（time/weather）不在本游戏
 * 使用范围内 —— 那些规则保留在 NyaaChat 项目里。
 *
 * 三层结构：
 *   1. 全局头：列出实际广告出来的工具 + 失败降级规则
 *   2. 骰子族 group：明骰 / 暗骰判断、结果四步重排格式
 *   3. 单工具规则：roll_coc / roll_dnd 各自的链式调用约束
 *
 * 规则来源：NyaaChat-MCP README §1（骰子无状态告警）+ §2.7-§2.10
 * （CoC / DnD 工具说明）。
 *
 * 加新工具：在 DICE_TOOLS 集合 + assembleMcpRules 的 switch 各加一行。
 */

const DICE_GROUP_RULES = `═══ 掷骰工具使用准则 ═══

掷骰工具是**无状态计算器**——给一次入参，返回一次结果，不会因为前一步的判定通过/失败阻止你调下一个。剧情连贯性的责任在你这边，调骰前先读懂前一步的判定结果再决定要不要继续。

工具返回是多行原始数据（骰点明细 / 阈值表 / 修正项展开），是**给你解读用的**，**不要原样贴给用户**。

结果展示格式：让用户视觉聚焦在**最终骰点**和**判定结果**两个核心信息上，按以下四步重排：
1. 先突出展示**最终骰点数字**（粗体或独立成行强调，如"**04**"、"**26**"）。
2. 紧跟一行次级文字简述骰点构成（哪些骰子相加、奖励/惩罚骰从哪几个里取）。
3. 再突出展示**判定结果**（如"**极难成功**"、"**vs DC 15 → 成功**"、"**暴击**"）。
4. 最后用次级文字简述判定依据（阈值表 / 对比 DC / 优劣势取舍）。

格式参考（roll_coc 技能 60、奖励骰 1 个、最终 04）：
> **🎲 04**
> 十位骰 [3, 0] 取 0，个位骰 4。
> **✨ 极难成功**
> 阈值：≤12 极难 / ≤30 困难 / ≤60 普通。

明骰 vs 暗骰：
- **明骰**：玩家主动声明的检定（"我尝试侦查"、"我用闪避"）、攻击 / 豁免 / 主动技能检定 → 按上述四步格式完整展示骰点和判定结果。
- **暗骰**：DM 主动触发的、玩家提前知道结果会破坏沉浸感的检定（隐藏的感知 / 识谎 / SAN / 潜行被发现 / 命运豁免等）→ 不公开具体骰点，用【暗骰】标记或仪式语引出（如"（暗中掷骰）"），只告知判定结果或直接把结果叙事化呈现。
- 拿不准就走明骰；只有"玩家提前知结果会破坏体验"的场景才走暗骰。`;

const ROLL_COC_RULES = `— roll_coc —
- 标准技能检定调用：{skill: 65}；紧张/不利状态加 penalty 1–2；关键时刻 + 推一把加 bonus 1–2（bonus 与 penalty 互斥）。
- CoC \`0/X\` 类 SAN 检定**通过**则**不要**再掷损失骰；失败再走损失骰（本客户端可能未启用 roll_dice，失败时直接叙述 SAN 受冲击即可）。
- CoC 大失败（骰点 100 / skill<50 时 96–100）后是否追加额外惩罚（额外 SAN 损失、武器卡壳等）由你判断。
- 工具不返回 SAN 损失骰、伤害骰等附加掷骰——这部分用文字直接叙述。`;

const ROLL_DND_RULES = `— roll_dnd —
- 必须包含恰好一个 1d20 主骰；可附加最多 3 项修正（常数如 \`+5\`、小骰子组如 \`+1d4\`）。
- advantage: "normal" / "advantage" / "disadvantage"；type: "check" / "save" / "attack" / "raw"（只有 attack 会标记暴击/必失）。
- DnD 攻击 vs DC **失败** → **不要**再掷伤害骰；失败时直接叙述未命中。
- DnD 攻击命中（含暴击）→ 用文字描述伤害结果，不要主动追加掷骰。
- 伤害骰、属性生成骰等"非检定"随机数本客户端未启用，由你用文字直接叙述结果。`;

const ROLL_DICE_RULES = `— roll_dice —
- 通用骰子计算器，用于伤害骰 / 武器骰 / 起始属性 / 自定义检定的通用骰式。
- 入参支持 \`NdM[+K]\` 形式与 advantage / disadvantage（取最高/最低）。
- 不属于"检定"——结果由你叙事化解读为伤害值、获得物数量、属性值等，不要套用四步重排格式（那是检定专用）。`;

const FAILURE_DEGRADATION_RULES = `═══ 工具调用失败时（返回内容以 [tool_error] 开头）═══

绝不暴露"工具失败 / 网络错误 / 调用异常 / API"等内部状态。按当前场景降级：
- 角色扮演：用角色直觉/情绪自然表现"不知道"或"困惑"。例：（掷骰失败）"骰子滚到桌子底下了，再来一次"、"（皱了皱眉，又摇摇头）"。
- 信息化：用资讯环境本身的故障语言。例："…数据源异常…"、"信号不稳，请稍候"。

绝不在角色扮演中念出 [tool_error]、"调用失败"、"工具" 等术语。`;

const DICE_TOOLS = new Set(["roll_coc", "roll_dnd", "roll_dice"]);

/**
 * 根据本回合实际广告给 LLM 的工具名集合，组装对应的规则段。
 * 没有任何工具时返回 null —— 调用方应整段跳过注入。
 */
export function assembleMcpRules(advertised: string[]): string | null {
  if (advertised.length === 0) return null;

  const set = new Set(advertised);
  const sections: string[] = [];

  sections.push(`[MCP 工具使用准则]\n可用工具：${advertised.join(" / ")}`);

  const hasDice = advertised.some((n) => DICE_TOOLS.has(n));
  if (hasDice) {
    sections.push(DICE_GROUP_RULES);
    if (set.has("roll_coc")) sections.push(ROLL_COC_RULES);
    if (set.has("roll_dnd")) sections.push(ROLL_DND_RULES);
    if (set.has("roll_dice")) sections.push(ROLL_DICE_RULES);
  }

  sections.push(FAILURE_DEGRADATION_RULES);

  return sections.join("\n\n");
}
