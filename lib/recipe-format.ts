export interface RecipeSection {
  title: string;
  steps: string[];
}

function cleanTitle(line: string): string {
  return line
    .replace(/^#{1,6}\s*/, '')
    .replace(/^第?[一二三四五六七八九十0-9]+[、.．]\s*/, '')
    .replace(/^【(.+)】$/, '$1')
    .replace(/[：:]$/, '')
    .trim();
}

function isHeadingLine(line: string): boolean {
  const t = line.trim();
  if (!t) return false;
  if (/^#{1,6}\s+\S+/.test(t)) return true;
  if (/^【.+】$/.test(t)) return true;
  // 兼容「一、清蒸鲈鱼」「1. 清蒸鲈鱼」这类菜名标题；步骤通常后面会更长，这里限制长度避免误判。
  if (/^第?[一二三四五六七八九十0-9]+[、.．]\s*[^，。；;]{2,18}$/.test(t)) return true;
  // 兼容「清蒸鲈鱼：」作为菜名标题。
  if (/^[^，。；;]{2,18}[：:]$/.test(t) && !/^\d+[.、．]/.test(t)) return true;
  return false;
}

export function parseRecipeSections(recipe: string): RecipeSection[] {
  const lines = recipe
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const sections: RecipeSection[] = [];
  let current: RecipeSection | null = null;

  for (const line of lines) {
    if (isHeadingLine(line)) {
      if (current && (current.title || current.steps.length)) sections.push(current);
      current = { title: cleanTitle(line), steps: [] };
      continue;
    }

    if (!current) current = { title: '', steps: [] };
    current.steps.push(line);
  }

  if (current && (current.title || current.steps.length)) sections.push(current);
  return sections;
}
