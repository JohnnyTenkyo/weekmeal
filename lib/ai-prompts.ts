import type { Prefs } from './types';

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

// 1) 分析单道菜：做法 + 原材料清单
export function recipePrompt(dish: string, prefs: Prefs, mealLabel?: string, extra?: string) {
  const constraints = prefsToConstraints(prefs);
  const guide = mealLabel ? mealGuide(mealLabel) : '';
  const extraText = extra && extra.trim() ? `
用户的额外要求：${extra.trim()}。请在不违反健康约束的前提下尽量满足。` : '';
  return {
    system: `你是一位贴心的家庭营养师兼广式家常菜厨师。请严格遵守以下约束：
${constraints}
${guide}

只输出 JSON，不要任何额外文字或 markdown 代码块标记。`,
    user: `我想吃「${dish}」。请在符合上述约束的前提下，给出适合家庭做的做法，并列出需要采购的原材料。${extraText}
严格按如下 JSON 结构返回：
{
  "recipe": "分步骤做法，用换行分隔，尽量清淡健康",
  "health_note": "结合用户健康状况，说明这道菜对身体的好处或注意点，2-3 句",
  "ingredients": [{"name":"食材名","amount":"用量"}],
  "preps": [{"item":"前一天需要解冻或预处理的事项","kind":"defrost或prep"}]
}
preps 里只放真正需要提前一天准备的（比如解冻肉类、泡发干货、腌制），没有就给空数组。`,
  };
}

// 2) 生成一周三餐推荐
export function weekPlanPrompt(prefs: Prefs, weekDates: string[]) {
  const constraints = prefsToConstraints(prefs);
  return {
    system: `你是家庭营养师，为高血脂人群规划一周清淡健康三餐。严格遵守：\n${constraints}\n\n只输出 JSON，不要任何额外文字或 markdown 标记。`,
    user: `请规划这一周（${weekDates[0]} 到 ${weekDates[6]}）共 7 天、每天早午晚三餐。\n务必满足：整体低盐低糖低脂；红肉全周累计不超过约束克数和顿数；多用鱼、禽、豆制品、时蔬；广式清淡口味；不辣、无忌口食材。\n严格按如下 JSON 结构返回（days 长度必须为 7，顺序对应给定日期）：\n{\n  "days": [\n    {"date":"${weekDates[0]}","breakfast":"菜名","lunch":"菜名","dinner":"菜名"}\n  ]\n}`,
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
