'use client';
import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { getPreps, togglePrep, deletePrep, addPrep, getMealsBetween } from '@/lib/db';
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
  const [tomorrowMeals, setTomorrowMeals] = useState<Meal[]>([]);
  const [loading, setLoading] = useState(true);
  const [newItem, setNewItem] = useState('');
  const [newKind, setNewKind] = useState<'defrost' | 'prep'>('defrost');
  const [toast, setToast] = useState<string | null>(null);

  function ping(m: string) { setToast(m); setTimeout(() => setToast(null), 1800); }

  const load = useCallback(async () => {
    if (!supabaseReady || !user) { setLoading(false); return; }
    setLoading(true);
    const [preps, meals] = await Promise.all([
      getPreps(user.username, today),
      getMealsBetween(user.username, tomorrow, tomorrow),
    ]);
    setTodayPreps(preps);
    setTomorrowMeals(meals);
    setLoading(false);
  }, [today, tomorrow, user]);

  useEffect(() => { load(); }, [load]);

  async function onToggle(p: Prep) { await togglePrep(p.id, !p.done); await load(); }
  async function onDelete(p: Prep) { await deletePrep(p.id); await load(); }

  async function onAdd() {
    if (!newItem.trim()) return;
    await addPrep({ owner: user!.username, prep_date: today, item: newItem.trim(), kind: newKind });
    setNewItem('');
    await load();
    ping('已添加 ✓');
  }

  const pending = todayPreps.filter((p) => !p.done);

  return (
    <div>
      <SectionTitle sub="今天该处理的 + 明天要吃的">今明提醒</SectionTitle>
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
                {todayPreps.map((p) => (
                  <li key={p.id} className="flex items-center gap-3">
                    <button onClick={() => onToggle(p)}
                      className="flex flex-1 items-center gap-3 rounded-xl px-2 py-2 text-left transition hover:bg-black/[0.02]">
                      <span className="flex h-5 w-5 items-center justify-center rounded-md border text-xs"
                        style={{
                          borderColor: p.done ? 'var(--accent-2)' : 'var(--line)',
                          background: p.done ? 'var(--accent-2)' : 'transparent', color: '#fff',
                        }}>{p.done ? '✓' : ''}</span>
                      <span className="text-base">{p.kind === 'defrost' ? '🧊' : '🔪'}</span>
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
              <input value={newItem} onChange={(e) => setNewItem(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && onAdd()}
                placeholder="手动加一项，比如：解冻牛腩"
                className="flex-1 rounded-xl border bg-white px-3 py-2 text-sm" style={{ borderColor: 'var(--line)' }} />
              <Button onClick={onAdd}>加</Button>
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
        </div>
      )}
      <Toast msg={toast} />
    </div>
  );
}
