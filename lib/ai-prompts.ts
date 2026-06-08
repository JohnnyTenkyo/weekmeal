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

// 一餐该上几道菜：按人数和餐别给出合理的菜品数量，保证够吃
export function mealCompositionRule(p: Prefs, mealLabel?: string): string {
  const people = p.peopleCount && p.peopleCount > 0 ? p.peopleCount : 2;
  const isBreakfast = mealLabel ? mealLabel.includes('早') : false;
  let dishHint: string;
  if (isBreakfast) {
    dishHint = people <= 2
      ? '早餐安排 2~3 样（如主食/粥 + 1~2 个清淡小菜或蛋类），简单够吃即可'
      : `早餐安排 ${Math.max(3, Math.ceil(people / 1.5))} 样左右（主食/粥 + 几样小菜/蛋），让 ${people} 人都吃饱`;
  } else {
    const base = Math.max(2, Math.round(people / 1.5) + 1); // 含主食在内的大致菜数
    dishHint = `这是正餐，按 ${people} 人的饭量安排 ${base}~${base + 1} 道菜（其中包含 1 份主食，其余为荤素搭配的菜，多用鱼/禽/豆制品/时蔬），保证 ${people} 个人吃饱吃好、荤素均衡`;
  }
  return `【一餐的构成】${dishHint}。一顿饭不是只做一道菜，要像家里正常开饭那样有主食有菜、数量够 ${people} 人吃。`;
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

// 常见忌口"类别词"展开成具体子类，避免模型只做字面匹配而漏掉子项
const AVOID_EXPAND: Record<string, string[]> = {
  '菌菇': ['香菇', '金针菇', '平菇', '杏鲍菇', '茶树菇', '蟹味菇', '白玉菇', '草菇', '口蘑', '双孢菇', '木耳', '银耳', '猴头菇', '松茸', '牛肝菌', '羊肚菌', '滑子菇', '海鲜菇', '鸡腿菇'],
  '海鲜': ['鱼', '虾', '蟹', '贝类', '蛤蜊', '生蚝', '扇贝', '鱿鱼', '章鱼', '墨鱼', '海参', '带鱼', '黄鱼', '鲈鱼'],
  '内脏': ['猪肝', '鸡肝', '鸭肝', '猪心', '猪肚', '大肠', '腰花', '猪腰', '鸡胗', '鸭胗', '毛肚', '黄喉'],
  '芹菜': ['西芹', '香芹', '芹菜叶'],
  '香菜': ['芫荽'],
  '羊肉': ['羊排', '羊腿', '羊蝎子', '涮羊肉', '孜然羊肉'],
  '牛肉': ['牛腩', '牛腱', '肥牛', '牛排', '牛筋'],
  '豆制品': ['豆腐', '豆干', '豆皮', '腐竹', '豆浆', '油豆腐', '千张'],
  '猪肉': ['五花肉', '里脊', '排骨', '猪蹄', '梅花肉', '猪肝'],
  '辣': ['辣椒', '辣酱', '花椒', '麻辣', '剁椒'],
  '蛋': ['鸡蛋', '鸭蛋', '皮蛋', '咸蛋', '蛋黄', '蛋清'],
  '葱': ['大葱', '小葱', '香葱', '葱花'],
  '蒜': ['大蒜', '蒜末', '蒜泥', '蒜苗'],
  '姜': ['生姜', '姜片', '姜末'],
};

function expandAvoid(name: string): string {
  const subs = AVOID_EXPAND[name];
  return subs ? `${name}（包括但不限于：${subs.join('、')}等一切${name}类食材）` : name;
}

// 把口味/健康偏好拼成系统约束，喂给所有 AI 调用
export function prefsToConstraints(p: Prefs): string {
  const lines: string[] = [];
  lines.push(`用户菜系偏好：${p.cuisine || '不限'}。`);
  lines.push(p.spicy ? '可以接受辣味。' : '【重要】完全不吃辣，不要任何辣椒、辣酱、花椒等辛辣调料。');
  if (p.avoid && p.avoid.length) {
    const expanded = p.avoid.map(expandAvoid);
    lines.push(`【忌口·最高优先级·硬性红线】用户绝对不吃以下食材，任何菜名、做法、食材清单里都【绝对禁止】出现它们或它们的任何子类、变体、同义词：\n${expanded.map((e) => '  - ' + e).join('\n')}\n这是不可违反的底线，优先级高于一切其他偏好。生成每一道菜前，先逐一核对菜名和所有食材是否触碰上述忌口；只要沾边就必须换一道完全不含忌口成分的菜。例如忌口\"菌菇\"时，\"香菇豆腐汤\"\"金针菇肥牛\"\"木耳炒蛋\"等含任意菌菇的菜都【禁止】出现。`);
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
  "recipe": "必须按菜分段。每一道菜先单独一行写 ## 菜名 作为标题，下面写这道菜的步骤；不同菜之间空一行。步骤里调味用量要量化（克数+通俗说法）。如果输入本身包含多道菜（用、/，/逗号分隔），每道菜都要单独成段。" ,
  "health_note": "结合用户健康状况说明；若与健康相背离则严肃警示风险并给改良建议",
  "conflict": false,
  "ingredients": [{"name":"食材名","amount":"精确克数+通俗说法，如 250克（约半斤）"}],
  "preps": [{"item":"要做的事，如：解冻鲈鱼/腌制鸡肉/泡发干货","kind":"defrost或prep","when":"same或prev","time":"HH:MM"}]
}
【recipe 格式强制要求】不要把多道菜混在一起写；必须用 "## 菜名" 分段。例如：
## 清蒸鲈鱼
1. ...
2. ...

## 冬瓜炒虾仁
1. ...
2. ...
preps 里放所有需要提前处理的事项（解冻、腌制、泡发等），并按上面的规则给出 when 和 time；完全不需要预处理才给空数组。`,
  };
}

// 2) 生成一周三餐推荐
export function weekPlanPrompt(prefs: Prefs, weekDates: string[]) {
  const constraints = prefsToConstraints(prefs);
  return {
    system: `你是家庭营养师，为高血脂人群规划一周清淡健康三餐。严格遵守：\n${constraints}\n\n【生成纪律】上面的忌口红线是硬约束。你给出的 21 道菜，每一道的菜名都【绝对不能】包含任何忌口食材或其子类。输出前请逐道复查菜名，发现沾到忌口的立刻替换成不含忌口成分的菜。\n\n只输出 JSON，不要任何额外文字或 markdown 标记。`,
    user: `请规划这一周（${weekDates[0]} 到 ${weekDates[6]}）共 7 天、每天早午晚三餐。\n务必满足：整体低盐低糖低脂；红肉全周累计不超过约束克数和顿数；多用鱼、禽、豆制品、时蔬；广式清淡口味；不辣；【严格规避所有忌口食材及其子类，这是红线】；份量按上述人数和分饱程度安排，保证够吃。\n严格按如下 JSON 结构返回（days 长度必须为 7，顺序对应给定日期）：\n{\n  "days": [\n    {"date":"${weekDates[0]}","breakfast":"菜名","lunch":"菜名","dinner":"菜名"}\n  ]\n}`,
  };
}

// 3) 根据现有食材反推：凑成够 N 人吃的一整顿饭（不够可补充额外食材）
export function fromIngredientsPrompt(ingredients: string, prefs: Prefs, mealLabel?: string) {
  const constraints = prefsToConstraints(prefs);
  const composition = mealCompositionRule(prefs, mealLabel);
  const mealText = mealLabel ? `这一顿是【${mealLabel}】。` : '这是一顿正餐。';
  return {
    system: `你是广式家常菜厨师兼营养师。严格遵守：
${constraints}

【以现有食材为核心、凑够一整顿】用户想优先消化家里现有的食材，但最终这一顿必须够设置的人数吃。规则：
1）尽量把现有食材用进去，可以分散到不同菜里（比如胡萝卜一道菜、鸡蛋另一道菜），也可以放进同一道菜，怎么合理怎么来；
2）如果光靠现有食材不够这么多人吃，就【补充额外食材】，多出来的食材列进每道菜的 missing（需要去买/补充的）；
3）如果现有食材已经足够这一顿吃饱，就不必补充，missing 给空数组；
4）整顿要符合上面的菜数和荤素搭配要求，含主食。

只输出 JSON，不要额外文字或 markdown 标记。`,
    user: `我现在家里有这些食材：${ingredients}。${mealText}
请据此搭配出【2~3 套】可选的整顿方案，每套都是够上述人数吃的一顿饭（多道菜、含主食），优先用上我现有的食材，不够的部分注明要补买什么。
严格按如下 JSON 结构返回：
{
  "plans": [
    {"dishes":[{"title":"菜名","uses":["这道菜用到的我现有的食材"],"missing":["这道菜还需补买的食材，没有就空数组"]}],"summary":"这套方案一句话说明（够几人吃、用了哪些现有食材）"}
  ]
}`,
  };
}

// 3b) 把"一整顿方案"做出来，写入某一餐：以现有食材为主，不够可补买
export function dishFromGivenPrompt(dishes: string, available: string, prefs: Prefs, mealLabel?: string) {
  const constraints = prefsToConstraints(prefs);
  const guide = mealLabel ? mealGuide(mealLabel) : '';
  const composition = mealCompositionRule(prefs, mealLabel);
  return {
    system: `你是一位贴心的家庭营养师兼广式家常菜厨师。请严格遵守以下约束：
${constraints}
${guide}
${composition}
${QUANTIFY_RULE}
${PREP_RULE}

【以现有食材为主、凑够一整顿】这一顿要做用户选定的这几道菜，凑成够设置人数吃的一整顿饭。优先使用用户现有的食材，把它们用进对应的菜里；如果现有食材不够这么多人吃，可以补充额外食材，但要把所有补充/需要去买的食材也如实列进 ingredients。ingredients 要包含这一整顿所有菜需要的全部原材料（现有的 + 需补买的），每样用量按人数量化。

只输出 JSON，不要任何额外文字或 markdown 代码块标记。`,
    user: `我家里现有这些食材：${available}。请帮我把这一顿（包含这几道菜：${dishes}）做出来，份量要够上述人数吃。优先用我现有的食材，不够的可以补充，但补充的食材也要列进采购清单。
严格按如下 JSON 结构返回：
{
  "recipe": "这一整顿所有菜必须按菜分段。每一道菜先单独一行写 ## 菜名 作为醒目标题，下面写这道菜的步骤；不同菜之间空一行。步骤里调味用量量化（克数+通俗说法）。" ,
  "health_note": "结合用户健康状况，说明这顿对身体的好处或注意点，2-3 句",
  "ingredients": [{"name":"食材名","amount":"精确克数+通俗说法","have":true}],
  "preps": [{"item":"要做的事","kind":"defrost或prep","when":"same或prev","time":"HH:MM"}]
}
【recipe 格式强制要求】不要把多道菜混在一起写；必须用 "## 菜名" 分段。例如：
## 胡萝卜炒蛋
1. ...
2. ...

## 清炒青菜
1. ...
2. ...
ingredients 里 have 字段：我现有的食材填 true，需要补买的填 false。preps 按上面规则给出 when 和 time；不需要预处理才给空数组。`,
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
  const composition = mealCompositionRule(prefs, mealLabel);
  return {
    system: `你是广式家常菜厨师兼营养师，为高血脂人群推荐清淡健康的一整顿饭。严格遵守：
${constraints}
${guide}
${composition}

只输出 JSON，不要任何额外文字或 markdown 标记。`,
    user: `请为「${mealLabel}」重新搭配【一整顿饭】（多道菜，份量够上述人数吃）。
${avoidText}${extraText}
要求：符合上述健康与口味约束；严格按【一餐的构成】给出的道数来安排，不要只给一道菜；与已有菜在主料、做法上尽量有区分；荤素搭配、含主食。
严格按如下 JSON 结构返回（dishes 数组，每道一个元素）：
{
  "dishes": ["菜名1", "菜名2", "菜名3"],
  "reason": "一句话说明这顿这样搭配的理由",
  "health_note": "结合用户健康状况，说明这顿对身体的好处，1-2 句"
}`,
  };
}
