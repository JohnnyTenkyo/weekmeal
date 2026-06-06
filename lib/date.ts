// 以「周一」为一周起点的日期工具

export function toYMD(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function parseYMD(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

// 返回某天所在周的周一
export function startOfWeek(d: Date): Date {
  const x = new Date(d);
  const day = (x.getDay() + 6) % 7; // 周一=0
  x.setDate(x.getDate() - day);
  x.setHours(0, 0, 0, 0);
  return x;
}

export function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

// 返回一周 7 天的日期字符串
export function weekDates(weekStart: Date): string[] {
  return Array.from({ length: 7 }, (_, i) => toYMD(addDays(weekStart, i)));
}

export const WEEK_LABELS = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];

export function ymdLabel(s: string): string {
  const d = parseYMD(s);
  return `${d.getMonth() + 1}月${d.getDate()}日`;
}

export function todayYMD(): string {
  return toYMD(new Date());
}
