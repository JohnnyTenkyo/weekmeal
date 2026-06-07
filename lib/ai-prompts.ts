import type { Prefs } from './types';

// 吃几分饱的文字描述
function fullnessLabel(f: number): string {
  if (f <= 5) return '只吃五六分饱，份量偏少、清淡';
  if (f <= 7) return '吃七分饱，份量适中';
  if (f <= 8) return '吃八分饱，正常家常份量';
  return '吃饱吃满（九到十分饱），份量要足、管够';
}

// 份量约束：几人吃 + 几分饱，所有 AI 生成都带上
export function portionConstraint(p: Prefs): string {
  const people = p.peopleCount && p.peopleCount > 0 ? p.peopleCount : 2;
  const full = p.fullness && p.fullness > 0 ? p.fullness : 8;
  return `【份量】这一餐共 ${people} 人吃，目标${fullnessLabel(full)}。所有食材用量必须按 ${people} 人的量来计算，确保够吃、不浪费，主食和菜量都要匹配人数。`;
}

// 量化要求：精确克数 + 通俗说法
const QUANTIFY_RULE =
  '【用量必须量化】每一样食材和调料都要给出精确克数/毫升/个数，并在括号里补一个通俗说法，方便不用秤也能下厨，例如「生抽 15 克（约一汤勺）」「盐 3 克（约半茶匙）」「五花肉 250 克（约半斤）」「油 10 克（约一勺）」。常见换算参考：一茶匙≈5克、一汤勺/一勺≈15克、一斤=500克、半斤=250克。做法步骤里凡涉及调味也要写清用量。';

// 预处理时间推断规则
const PREP_RULE =
  '【预处理与时间】生肉、生鱼、海鲜、冷冻食材默认都放在冰箱（冷冻或冷藏），需要提前解冻/腔制/泡发的要列入 preps。吃饭时间默认：早餐 7:30、午餐 12:30、晚餐 18:30。请据此【反推】每项预处理建议几点开始，给出 when 和 time 两个字段：' +
  '- when：填 "same"（吃饭当天处理，如当天早上解冻、提前几小时腔制）或 "prev"（必须前一晚处理，如大块肉解冻一夜、干货泡发过夜、需腔制过夜入味）。' +
  '- time：建议开始处理的时间，24小时制 HH:MM。例如午餐有鱼要解冻+腔制，鱼当天早上解冻即可，可给 when="same"、time="08:00"；若是大块牛腩这类解冻慢的，给 when="prev"、time="21:00"。' +
  '判断要符合常理：解冻小块鱼/虾 2-3 小时、解冻大块肉需一夜；腔制 30 分钟到几小时按菜定；泡发干货通常要过夜。';

// 把口味/健康偏好拼成系统约束，喂给所有 AI 调用
export function prefsToConstraints(p: Prefs): string {
  const lines: string[] = [];
  lines.push(`用户菜系偏好：${p.cuisine || '不限'}。`);
  lines.push(p.spicy ? '可以接受辣味。' : '【重要】完全不吃辣，不要任何辣椒、辣酱、花椒等辛辣调料。');
  if (p.avoid && p.avoid.length) {
    lines.push(`【忌口】绝对不要使用以下食材：${p.avoid.join('、')}。`);
  }
  if (p.health) lines.push(`健康状况：${p.health}。需低盐、低糖、低油低脂，清淡为主。`);
  if (p.redMeatMaxMeals != null) {
    lines.push(`红肉（猪牛羊）限制：每周最多 ${p.redMeatMaxMeals} 顿、累计不超过 ${p.redMeatMaxGrams} 克，其余多用鱼、禽、豆制品和蔬菜。`);
  }
  lines.push(portionConstraint(p));
  return lines.join('\n');
}

// 不同餐别的合理度指导，避免早餐给大餐
function mealGuide(mealLabel: string): string {
  if (mealLabel.includes('早')) {
    return '这是【早餐】：要清淡、易消化、备餐快，例如粥、汤面、蒸蛋、全麦面包、豆浆配小菜等，份量适中，不要做成正餐大菜或重油菜式。';
  }
  if (mealLabel.includes('午')) {
    return '这是【午餐】：可以是一顿正餐，有主食+蛋白+蔬菜，营养均衡但仍保持清淡健康。';
  }
  if (mealLabel.includes('晚')) {
    return '这是【晚餐】：正餐但宜清淡少油、不过饱，适合晚间消化，多用鱼、禽、豆制品和时蔬。';
  }
  return '请按常理安排这一餐的合理份量与菜式。';
}

// 1) 分析单道菜：做法 + 原材料清单（含健康冲突检测）
export function recipePrompt(dish: string, prefs: Prefs, mealLabel?: string, extra?: string) {
  const constraints = prefsToConstraints(prefs);
  const guide = mealLabel ? mealGuide(mealLabel) : '';
  const extraText = extra && extra.trim() ? `
用户的额外要求：${extra.trim()}。请在不违反健康约束的前提下尽量满足。` : '';
  return {
    system: `你是一位贴心的家庭营养师兼广式家常菜厨师。请严格遵守以下约束：
${constraints}
${guide}
${QUANTIFY_RULE}
${PREP_RULE}

【健康冲突检测】这道菜是用户自己点的，可能并不适合他的健康状况。请认真判断：如果这道菜与用户的健康状况明显相背离（例如高血脂/高血压的人吃红烧肉、肥肉、油炸、动物内脏、高盐高糖等），你必须在 health_note 里【明确地、严肃地】警示，说清楚为什么不建议吃、有什么风险，并给出更健康的替代或改良做法。这种情况把 conflict 设为 true。如果这道菜是健康安全的，conflict 设为 false，health_note 正常说明好处即可。

只输出 JSON，不要任何额外文字或 markdown 代码块标记。`,
    user: `我想吃「${dish}」。请在符合上述约束的前提下，给出适合家庭做的做法，并列出需要采购的原材料。${extraText}
严格按如下 JSON 结构返回：
{
  "recipe": "分步骤做法，用换行分隔，调味用量要量化（克数+通俗说法）",
  "health_note": "结合用户健康状况说明；若与健康相背离则严肃警示风险并给改良建议",
  "conflict": false,
  "ingredients": [{"name":"食材名","amount":"精确克数+通俗说法，如 250克（约半斤）"}],
  "preps": [{"item":"要做的事，如：解冻鲈鱼/腌制鸡肉/泡发干货","kind":"defrost或prep","when":"same或prev","time":"HH:MM"}]
}
preps 里放所有需要提前处理的事项（解冻、腌制、泡发等），并按上面的规则给出 when 和 time；完全不需要预处理才给空数组。`,
  };
}

// 2) 生成一周三餐推荐
export function weekPlanPrompt(prefs: Prefs, weekDates: string[]) {
  const constraints = prefsToConstraints(prefs);
  return {
    system: `你是家庭营养师，为高血脂人群规划一周清淡健康三餐。严格遵守：\n${constraints}\n\n只输出 JSON，不要任何额外文字或 markdown 标记。`,
    user: `请规划这一周（${weekDates[0]} 到 ${weekDates[6]}）共 7 天、每天早午晚三餐。\n务必满足：整体低盐低糖低脂；红肉全周累计不超过约束克数和顿数；多用鱼、禽、豆制品、时蔬；广式清淡口味；不辣、无忌口食材；份量按上述人数和分饱程度安排，保证够吃。\n严格按如下 JSON 结构返回（days 长度必须为 7，顺序对应给定日期）：\n{\n  "days": [\n    {"date":"${weekDates[0]}","breakfast":"菜名","lunch":"菜名","dinner":"菜名"}\n  ]\n}`,
  };
}

// 3) 根据现有食材反推能做的菜
export function fromIngredientsPrompt(ingredients: string, prefs: Prefs) {
  const constraints = prefsToConstraints(prefs);
  return {
    system: `你是广式家常菜厨师兼营养师。严格遵守：\n${constraints}\n\n只输出 JSON，不要额外文字或 markdown 标记。`,
    user: `我现在家里有这些食材：${ingredients}。\n请在符合约束的前提下，推荐 3~5 道可以做的菜，可以补充少量常见调料/配菜。\n严格按如下 JSON 结构返回：\n{\n  "dishes": [\n    {"title":"菜名","reason":"为什么推荐/用到哪些现有食材","missing":["还需补买的少量食材"]}\n  ]\n}`,
  };
}

// 3b) 用指定的现有食材做一道菜，写入某一餐（只用列出的原材料）
export function dishFromGivenPrompt(dish: string, available: string, prefs: Prefs, mealLabel?: string) {
  const constraints = prefsToConstraints(prefs);
  const guide = mealLabel ? mealGuide(mealLabel) : '';
  return {
    system: `你是一位贴心的家庭营养师兼广式家常菜厨师。请严格遵守以下约束：
${constraints}
${guide}
${QUANTIFY_RULE}
${PREP_RULE}

【只用现有食材】用户只想用家里现有的原材料做这道菜。ingredients 里【只能】包含用户提供的这些原材料（可以只用其中一部分），绝对不要引入用户没有的新原材料；唯一例外是水、盐、生抽、油这类最基本的厨房调味料可以少量使用。即便份量要满足人数，也只能在现有食材范围内调配。

只输出 JSON，不要任何额外文字或 markdown 代码块标记。`,
    user: `请用我现有的这些食材：${available}，做「${dish}」。份量要满足上述人数、保证够吃，但原材料只能从我列出的里面选。
严格按如下 JSON 结构返回：
{
  "recipe": "分步骤做法，用换行分隔，调味用量要量化（克数+通俗说法）",
  "health_note": "结合用户健康状况，说明这道菜对身体的好处或注意点，2-3 句",
  "ingredients": [{"name":"食材名（必须来自我提供的列表）","amount":"精确克数+通俗说法"}],
  "preps": [{"item":"要做的事","kind":"defrost或prep","when":"same或prev","time":"HH:MM"}]
}
preps 按上面规则给出 when 和 time；不需要预处理才给空数组。`,
  };
}

// 4) 换一道菜：为某一餐生成一个新菜建议，避开本周已有的菜
export function suggestDishPrompt(
  mealLabel: string,
  existingDishes: string[],
  prefs: Prefs,
  extra?: string
) {
  const constraints = prefsToConstraints(prefs);
  const guide = mealGuide(mealLabel);
  const avoidList = existingDishes.filter(Boolean);
  const avoidText = avoidList.length
    ? `本周已经安排了以下菜，请【不要重复、也不要高度相似】：${avoidList.join('、')}。`
    : '本周暂时没有其它菜。';
  const extraText = extra && extra.trim() ? `
用户的额外要求：${extra.trim()}。请在不违反健康约束的前提下尽量满足。` : '';
  return {
    system: `你是广式家常菜厨师兼营养师，为高血脂人群推荐清淡健康的单道菜。严格遵守：
${constraints}
${guide}

只输出 JSON，不要任何额外文字或 markdown 标记。`,
    user: `请为「${mealLabel}」推荐一道新菜。
${avoidText}${extraText}
要求：符合上述健康与口味约束；菜式份量要与餐别相称（早餐就给早餐，不要给正餐大菜）；尽量与已有菜在主料、做法上有区分。
严格按如下 JSON 结构返回：
{
  "title": "菜名",
  "reason": "一句话推荐理由",
  "health_note": "结合用户健康状况，说明这道菜对身体的好处，1-2 句"
}`,
  };
}
