'use client';
import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { getPreps, togglePrep, deletePrep, addPrep, getMealsBetween, toggleIngredient } from '@/lib/db';
import type { Prep, Meal } from '@/lib/types';
import { MEAL_TYPES, MEAL_LABELS } from '@/lib/types';
import { todayYMD, toYMD, addDays, parseYMD, ymdLabel } from '@/lib/date';
import { Button, SectionTitle, Spinner, Toast } from '@/components/ui';
import ConfigBanner from '@/components/ConfigBanner';
import { supabaseReady } from '@/lib/supabase';
import { useAuth } from '@/components/AuthProvider';

export default function TodayPage() {
  const { user } = useAuth();
  const today = todayYMD();
  const tomorrow = toYMD(addDays(parseYMD(today), 1));

  const [todayPreps, setTodayPreps] = useState<Prep[]>([]);
  const [tomorrowPreps, setTomorrowPreps] = useState<Prep[]>([]);
  const [tomorrowMeals, setTomorrowMeals] = useState<Meal[]>([]);
  const [loading, setLoading] = useState(true);
  const [newItem, setNewItem] = useState('');
  const [newKind, setNewKind] = useState<'defrost' | 'prep'>('defrost');
  const [newTime, setNewTime] = useState('');
  const [tmrItem, setTmrItem] = useState('');
  const [tmrKind, setTmrKind] = useState<'defrost' | 'prep'>('defrost');
  const [tmrTime, setTmrTime] = useState('');
  const [toast, setToast] = useState<string | null>(null);

  function ping(m: string) { setToast(m); setTimeout(() => setToast(null), 1800); }

  const load = useCallback(async () => {
    if (!supabaseReady || !user) { setLoading(false); return; }
    setLoading(true);
    const [preps, tmrPreps, meals] = await Promise.all([
      getPreps(user.username, today),
      getPreps(user.username, tomorrow),
      getMealsBetween(user.username, tomorrow, tomorrow),
    ]);
    setTodayPreps(preps);
    setTomorrowPreps(tmrPreps);
    setTomorrowMeals(meals);
    setLoading(false);
  }, [today, tomorrow, user]);

  useEffect(() => { load(); }, [load]);

  async function onToggle(p: Prep) { await togglePrep(p.id, !p.done); await load(); }
  async function onDelete(p: Prep) { await deletePrep(p.id); await load(); }

  async function onAdd() {
    if (!newItem.trim()) return;
    await addPrep({ owner: user!.username, prep_date: today, item: newItem.trim(), kind: newKind, prep_time: newTime || null });
    setNewItem(''); setNewTime('');
    await load();
    ping('已添加 ✓');
  }

  async function onAddTomorrow() {
    if (!tmrItem.trim()) return;
    await addPrep({ owner: user!.username, prep_date: tomorrow, item: tmrItem.trim(), kind: tmrKind, prep_time: tmrTime || null });
    setTmrItem(''); setTmrTime('');
    await load();
    ping('已添加到明天 ✓');
  }

  async function onToggleIng(id: string, bought: boolean) {
    await toggleIngredient(id, bought);
    await load();
  }

  // 按时间从早到晚排序（无时间的排最后）
  function sortByTime<T extends { prep_time?: string }>(arr: T[]): T[] {
    return [...arr].sort((a, b) => {
      const ta = a.prep_time || '99:99';
      const tb = b.prep_time || '99:99';
      return ta.localeCompare(tb);
    });
  }

  const pending = todayPreps.filter((p) => !p.done);
  const tmrPending = tomorrowPreps.filter((p) => !p.done);
  const todaySorted = sortByTime(todayPreps);
  const tomorrowSorted = sortByTime(tomorrowPreps);

  // 基础调料/水，采购清单里不显示
  const BASICS = ['盐', '食盐', '油', '食用油', '植物油', '色拉油', '糖', '白糖', '冰糖', '清水', '温水', '热水', '凉水', '水'];
  function isBasic(name: string) {
    const n = name.replace(/\s|（.*?）|\(.*?\)/g, '');
    return BASICS.some((b) => n === b || (n.length <= 3 && n.includes(b)));
  }

  // 同名食材汇总：合并数量、保留各餐标签、记录每条原始 id（勾选时一起切换）
  type AggIng = { name: string; amounts: string[]; mealTypes: typeof MEAL_TYPES[number][]; ids: string[]; bought: boolean };
  const aggMap = new Map<string, AggIng>();
  for (const m of tomorrowMeals) {
    for (const ing of m.ingredients || []) {
      if (isBasic(ing.name)) continue;
      const key = ing.name.replace(/\s|（.*?）|\(.*?\)/g, '').toLowerCase();
      const ex = aggMap.get(key);
      if (ex) {
        if (ing.amount) ex.amounts.push(ing.amount);
        if (!ex.mealTypes.includes(m.meal_type)) ex.mealTypes.push(m.meal_type);
        ex.ids.push(ing.id);
        ex.bought = ex.bought && ing.bought;
      } else {
        aggMap.set(key, {
          name: ing.name, amounts: ing.amount ? [ing.amount] : [],
          mealTypes: [m.meal_type], ids: [ing.id], bought: ing.bought,
        });
      }
    }
  }
  const tomorrowShopping = Array.from(aggMap.values());

  return (
    <div>
      <SectionTitle sub="今天 / 明天该处理的 + 明天要吃的与采购">今明提醒</SectionTitle>
      <ConfigBanner />

      {!supabaseReady ? null : loading ? <Spinner label="加载中…" /> : (
        <div className="space-y-5">
          <section className="card p-4">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="font-semibold">今天要处理的</h3>
              {pending.length > 0 && (
                <span className="rounded-full px-2.5 py-0.5 text-xs text-white" style={{ background: 'var(--warn)' }}>
                  还剩 {pending.length} 项
                </span>
              )}
            </div>
            {todayPreps.length === 0 ? (
              <p className="text-sm" style={{ color: 'var(--ink-soft)' }}>今天没有需要解冻或预处理的东西 🎉</p>
            ) : (
              <ul className="space-y-1.5">
                {todaySorted.map((p) => (
                  <li key={p.id} className="flex items-center gap-3">
                    <button onClick={() => onToggle(p)}
                      className="flex flex-1 items-center gap-3 rounded-xl px-2 py-2 text-left transition hover:bg-black/[0.02]">
                      <span className="flex h-5 w-5 items-center justify-center rounded-md border text-xs"
                        style={{
                          borderColor: p.done ? 'var(--accent-2)' : 'var(--line)',
                          background: p.done ? 'var(--accent-2)' : 'transparent', color: '#fff',
                        }}>{p.done ? '✓' : ''}</span>
                      <span className="text-base">{p.kind === 'defrost' ? '🧊' : '🔪'}</span>
                      {p.prep_time && (
                        <span className="rounded-md px-1.5 py-0.5 text-xs font-medium tabular-nums"
                          style={{ background: 'var(--surface-2)', color: 'var(--accent-2)' }}>{p.prep_time}</span>
                      )}
                      <span className="flex-1 text-sm" style={{
                        color: p.done ? 'var(--ink-soft)' : 'var(--ink)',
                        textDecoration: p.done ? 'line-through' : 'none',
                      }}>{p.item}</span>
                    </button>
                    <button onClick={() => onDelete(p)} className="text-xs" style={{ color: 'var(--ink-soft)' }}>删</button>
                  </li>
                ))}
              </ul>
            )}

            <div className="mt-4 flex gap-2">
              <button onClick={() => setNewKind(newKind === 'defrost' ? 'prep' : 'defrost')}
                className="chip px-3 py-2 text-sm">{newKind === 'defrost' ? '🧊 解冻' : '🔪 预处理'}</button>
              <input type="time" value={newTime} onChange={(e) => setNewTime(e.target.value)}
                className="rounded-xl border bg-white px-2 py-2 text-sm tabular-nums" style={{ borderColor: 'var(--line)' }} />
              <input value={newItem} onChange={(e) => setNewItem(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && onAdd()}
                placeholder="手动加一项，比如：解冻牛腩"
                className="flex-1 rounded-xl border bg-white px-3 py-2 text-sm" style={{ borderColor: 'var(--line)' }} />
              <Button onClick={onAdd}>加</Button>
            </div>
          </section>

          <section className="card p-4">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="font-semibold">明天要处理的 <span className="text-xs font-normal" style={{ color: 'var(--ink-soft)' }}>{ymdLabel(tomorrow)}</span></h3>
              {tmrPending.length > 0 && (
                <span className="rounded-full px-2.5 py-0.5 text-xs text-white" style={{ background: 'var(--warn)' }}>
                  还剩 {tmrPending.length} 项
                </span>
              )}
            </div>
            {tomorrowPreps.length === 0 ? (
              <p className="text-sm" style={{ color: 'var(--ink-soft)' }}>明天暂时没有需要处理的（AI 生成菜谱时会自动填入）</p>
            ) : (
              <ul className="space-y-1.5">
                {tomorrowSorted.map((p) => (
                  <li key={p.id} className="flex items-center gap-3">
                    <button onClick={() => onToggle(p)}
                      className="flex flex-1 items-center gap-3 rounded-xl px-2 py-2 text-left transition hover:bg-black/[0.02]">
                      <span className="flex h-5 w-5 items-center justify-center rounded-md border text-xs"
                        style={{
                          borderColor: p.done ? 'var(--accent-2)' : 'var(--line)',
                          background: p.done ? 'var(--accent-2)' : 'transparent', color: '#fff',
                        }}>{p.done ? '✓' : ''}</span>
                      <span className="text-base">{p.kind === 'defrost' ? '🧊' : '🔪'}</span>
                      {p.prep_time && (
                        <span className="rounded-md px-1.5 py-0.5 text-xs font-medium tabular-nums"
                          style={{ background: 'var(--surface-2)', color: 'var(--accent-2)' }}>{p.prep_time}</span>
                      )}
                      <span className="flex-1 text-sm" style={{
                        color: p.done ? 'var(--ink-soft)' : 'var(--ink)',
                        textDecoration: p.done ? 'line-through' : 'none',
                      }}>{p.item}</span>
                    </button>
                    <button onClick={() => onDelete(p)} className="text-xs" style={{ color: 'var(--ink-soft)' }}>删</button>
                  </li>
                ))}
              </ul>
            )}
            <div className="mt-4 flex gap-2">
              <button onClick={() => setTmrKind(tmrKind === 'defrost' ? 'prep' : 'defrost')}
                className="chip px-3 py-2 text-sm">{tmrKind === 'defrost' ? '🧊 解冻' : '🔪 预处理'}</button>
              <input type="time" value={tmrTime} onChange={(e) => setTmrTime(e.target.value)}
                className="rounded-xl border bg-white px-2 py-2 text-sm tabular-nums" style={{ borderColor: 'var(--line)' }} />
              <input value={tmrItem} onChange={(e) => setTmrItem(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && onAddTomorrow()}
                placeholder="手动加一项到明天"
                className="flex-1 rounded-xl border bg-white px-3 py-2 text-sm" style={{ borderColor: 'var(--line)' }} />
              <Button onClick={onAddTomorrow}>加</Button>
            </div>
          </section>

          <section className="card p-4">
            <h3 className="mb-3 font-semibold">明天吃什么 <span className="text-xs font-normal" style={{ color: 'var(--ink-soft)' }}>{ymdLabel(tomorrow)}</span></h3>
            <div className="space-y-2">
              {MEAL_TYPES.map((t) => {
                const m = tomorrowMeals.find((x) => x.meal_type === t);
                return (
                  <Link key={t} href={`/meal?date=${tomorrow}&type=${t}`}
                    className="flex items-center justify-between rounded-xl px-3 py-2.5 transition hover:bg-black/[0.02]"
                    style={{ background: 'var(--surface-2)' }}>
                    <span className="text-sm" style={{ color: 'var(--ink-soft)' }}>{MEAL_LABELS[t]}</span>
                    <span className="text-sm" style={{ color: m?.title ? 'var(--ink)' : 'var(--line)' }}>{m?.title || '还没定 ＋'}</span>
                  </Link>
                );
              })}
            </div>
          </section>

          <section className="card p-4">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="font-semibold">明天要买的食材 <span className="text-xs font-normal" style={{ color: 'var(--ink-soft)' }}>三餐汇总</span></h3>
              <span className="text-xs" style={{ color: 'var(--ink-soft)' }}>勾选 = 已买 / 已有</span>
            </div>
            {tomorrowShopping.length === 0 ? (
              <p className="text-sm" style={{ color: 'var(--ink-soft)' }}>明天的菜还没生成采购清单（点开某一餐让 AI 分析后会出现）</p>
            ) : (
              <ul className="space-y-1.5">
                {tomorrowShopping.map((ing) => (
                  <li key={ing.name} className="flex items-center gap-3 rounded-xl px-2 py-1.5"
                    style={{ background: 'var(--surface-2)' }}>
                    <button onClick={() => ing.ids.forEach((id) => onToggleIng(id, !ing.bought))}
                      className="flex flex-1 items-center gap-3 text-left">
                      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md border text-xs"
                        style={{
                          borderColor: ing.bought ? 'var(--accent-2)' : 'var(--line)',
                          background: ing.bought ? 'var(--accent-2)' : 'transparent', color: '#fff',
                        }}>{ing.bought ? '✓' : ''}</span>
                      <span className="flex flex-1 flex-wrap items-center gap-1.5 text-sm" style={{
                        color: ing.bought ? 'var(--ink-soft)' : 'var(--ink)',
                        textDecoration: ing.bought ? 'line-through' : 'none',
                      }}>
                        {ing.mealTypes.map((t) => (
                          <span key={t} className="rounded px-1.5 py-0.5 text-xs" style={{ background: 'var(--surface)', color: 'var(--ink-soft)' }}>
                            {MEAL_LABELS[t]}
                          </span>
                        ))}
                        {ing.name}
                      </span>
                    </button>
                    {ing.amounts.length > 0 && (
                      <span className="shrink-0 text-xs" style={{ color: 'var(--ink-soft)' }}>{ing.amounts.join(' + ')}</span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}
      <Toast msg={toast} />
    </div>
  );
}
