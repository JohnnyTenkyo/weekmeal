'use client';
import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { getMealsBetween, cleanupOldMeals } from '@/lib/db';
import type { Meal, MealType } from '@/lib/types';
import { MEAL_TYPES, MEAL_LABELS } from '@/lib/types';
import { startOfWeek, weekDates, addDays, toYMD, WEEK_LABELS, ymdLabel, todayYMD } from '@/lib/date';
import { SectionTitle, Spinner } from '@/components/ui';
import ConfigBanner from '@/components/ConfigBanner';
import { supabaseReady } from '@/lib/supabase';
import { useAuth } from '@/components/AuthProvider';

export default function WeekPage() {
  const { user } = useAuth();
  const [weekStart, setWeekStart] = useState<Date>(() => startOfWeek(new Date()));
  const [meals, setMeals] = useState<Meal[]>([]);
  const [loading, setLoading] = useState(true);

  const dates = weekDates(weekStart);
  const today = todayYMD();

  const load = useCallback(async () => {
    if (!supabaseReady) { setLoading(false); return; }
    if (!user) { setLoading(false); return; }
    setLoading(true);
    const data = await getMealsBetween(user.username, dates[0], dates[6]);
    setMeals(data);
    setLoading(false);
  }, [dates[0], dates[6], user]);

  useEffect(() => { load(); }, [load]);

  // 每个会话清理一次：删除 2 周前的旧菜，节省存储
  useEffect(() => {
    if (!supabaseReady) return;
    if (!user) return;
    if (sessionStorage.getItem('cleaned_old_meals')) return;
    cleanupOldMeals(user.username).finally(() => sessionStorage.setItem('cleaned_old_meals', '1'));
  }, [user]);

  function mealAt(date: string, type: MealType): Meal | undefined {
    return meals.find((m) => m.date === date && m.meal_type === type);
  }

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <SectionTitle sub="点任意格子记录或查看那一餐">本周菜单</SectionTitle>
      </div>
      <ConfigBanner />

      <div className="mb-4 flex items-center justify-between">
        <button onClick={() => setWeekStart(addDays(weekStart, -7))}
          className="chip px-3 py-1.5 text-sm" style={{ color: 'var(--ink-soft)' }}>‹ 上周</button>
        <span className="text-sm font-medium">
          {ymdLabel(dates[0])} – {ymdLabel(dates[6])}
        </span>
        <button onClick={() => setWeekStart(addDays(weekStart, 7))}
          className="chip px-3 py-1.5 text-sm" style={{ color: 'var(--ink-soft)' }}>下周 ›</button>
      </div>
      <div className="mb-4 flex justify-center">
        <button onClick={() => setWeekStart(startOfWeek(new Date()))}
          className="text-xs underline" style={{ color: 'var(--accent)' }}>回到本周</button>
      </div>

      {!supabaseReady ? null : loading ? (
        <Spinner label="加载中…" />
      ) : (
        <div className="space-y-3">
          {dates.map((d, i) => (
            <div key={d} className="card overflow-hidden">
              <div className="flex items-center justify-between px-4 py-2"
                style={{ background: d === today ? 'var(--accent)' : 'var(--surface-2)' }}>
                <span className="text-sm font-semibold" style={{ color: d === today ? '#fff' : 'var(--ink)' }}>
                  {WEEK_LABELS[i]} · {ymdLabel(d)}
                </span>
                {d === today && <span className="text-xs text-white/90">今天</span>}
              </div>
              <div className="grid grid-cols-3 divide-x" style={{ borderColor: 'var(--line)' }}>
                {MEAL_TYPES.map((t) => {
                  const m = mealAt(d, t);
                  return (
                    <Link key={t} href={`/meal?date=${d}&type=${t}`}
                      className="flex min-h-[64px] flex-col gap-1 p-2.5 transition hover:bg-black/[0.02]">
                      <span className="text-xs" style={{ color: 'var(--ink-soft)' }}>{MEAL_LABELS[t]}</span>
                      <span className="text-sm leading-snug" style={{ color: m?.title ? 'var(--ink)' : 'var(--line)' }}>
                        {m?.title || '＋'}
                      </span>
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
