'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { upsertMeal } from '@/lib/db';
import type { MealType } from '@/lib/types';
import { startOfWeek, weekDates, ymdLabel, WEEK_LABELS } from '@/lib/date';
import { Button, SectionTitle, Spinner, Toast } from '@/components/ui';
import ConfigBanner from '@/components/ConfigBanner';
import { supabaseReady } from '@/lib/supabase';

interface DayPlan { date: string; breakfast: string; lunch: string; dinner: string; }
interface DishRec { title: string; reason: string; missing: string[]; }

export default function DiscoverPage() {
  const router = useRouter();
  const [tab, setTab] = useState<'week' | 'fridge'>('week');
  const [toast, setToast] = useState<string | null>(null);
  function ping(m: string) { setToast(m); setTimeout(() => setToast(null), 2000); }

  // 一周计划
  const [planLoading, setPlanLoading] = useState(false);
  const [plan, setPlan] = useState<DayPlan[] | null>(null);
  const [saving, setSaving] = useState(false);

  // 冰箱反推
  const [fridge, setFridge] = useState('');
  const [fridgeLoading, setFridgeLoading] = useState(false);
  const [dishes, setDishes] = useState<DishRec[] | null>(null);

  async function genWeek() {
    setPlanLoading(true); setPlan(null);
    try {
      const ws = startOfWeek(new Date());
      const dates = weekDates(ws);
      const resp = await fetch('/api/ai', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ task: 'weekplan', weekDates: dates }),
      });
      const json = await resp.json();
      if (!resp.ok) { ping(json.error || '生成失败'); return; }
      setPlan(json.result.days as DayPlan[]);
    } catch (e: any) { ping('出错：' + (e?.message || '')); }
    finally { setPlanLoading(false); }
  }

  async function applyWeek() {
    if (!plan) return;
    setSaving(true);
    try {
      for (const d of plan) {
        const entries: [MealType, string][] = [
          ['breakfast', d.breakfast], ['lunch', d.lunch], ['dinner', d.dinner],
        ];
        for (const [type, title] of entries) {
          if (title && title.trim()) {
            await upsertMeal({ date: d.date, meal_type: type, title: title.trim(), author: 'AI' });
          }
        }
      }
      ping('已写入本周菜单 ✓');
      setTimeout(() => router.push('/'), 800);
    } catch (e: any) { ping('写入失败：' + (e?.message || '')); }
    finally { setSaving(false); }
  }

  async function genFridge() {
    if (!fridge.trim()) { ping('先填一下现有的食材'); return; }
    setFridgeLoading(true); setDishes(null);
    try {
      const resp = await fetch('/api/ai', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ task: 'from-ingredients', ingredients: fridge.trim() }),
      });
      const json = await resp.json();
      if (!resp.ok) { ping(json.error || '推荐失败'); return; }
      setDishes(json.result.dishes as DishRec[]);
    } catch (e: any) { ping('出错：' + (e?.message || '')); }
    finally { setFridgeLoading(false); }
  }

  return (
    <div>
      <SectionTitle sub="不知道吃啥？交给 AI">想吃啥</SectionTitle>
      <ConfigBanner />

      <div className="mb-4 flex gap-2">
        <button onClick={() => setTab('week')}
          className="flex-1 rounded-full py-2 text-sm font-medium transition"
          style={{
            background: tab === 'week' ? 'var(--accent)' : 'var(--surface)',
            color: tab === 'week' ? '#fff' : 'var(--ink-soft)',
            border: '1px solid var(--line)',
          }}>一周三餐推荐</button>
        <button onClick={() => setTab('fridge')}
          className="flex-1 rounded-full py-2 text-sm font-medium transition"
          style={{
            background: tab === 'fridge' ? 'var(--accent)' : 'var(--surface)',
            color: tab === 'fridge' ? '#fff' : 'var(--ink-soft)',
            border: '1px solid var(--line)',
          }}>现有食材能做啥</button>
      </div>

      {!supabaseReady ? null : tab === 'week' ? (
        <div className="space-y-4">
          <div className="card p-4">
            <p className="mb-3 text-sm" style={{ color: 'var(--ink-soft)' }}>
              按你的健康偏好（低盐低糖低脂、红肉每周限量、广式清淡、不辣无忌口）生成本周三餐。
            </p>
            <Button onClick={genWeek} disabled={planLoading} className="w-full">
              {planLoading ? <Spinner label="AI 规划中…" /> : '✨ 生成本周三餐'}
            </Button>
          </div>

          {plan && (
            <>
              <div className="space-y-2">
                {plan.map((d, i) => (
                  <div key={d.date} className="card p-3">
                    <div className="mb-2 text-xs font-semibold" style={{ color: 'var(--accent)' }}>
                      {WEEK_LABELS[i] || ''} · {ymdLabel(d.date)}
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-sm">
                      <div><span className="text-xs" style={{ color: 'var(--ink-soft)' }}>早 </span>{d.breakfast}</div>
                      <div><span className="text-xs" style={{ color: 'var(--ink-soft)' }}>午 </span>{d.lunch}</div>
                      <div><span className="text-xs" style={{ color: 'var(--ink-soft)' }}>晚 </span>{d.dinner}</div>
                    </div>
                  </div>
                ))}
              </div>
              <Button onClick={applyWeek} disabled={saving} className="w-full">
                {saving ? '写入中…' : '采用并写入本周菜单'}
              </Button>
              <p className="text-center text-xs" style={{ color: 'var(--ink-soft)' }}>
                写入后可在「本周」点开每一餐，再让 AI 出做法和采购清单
              </p>
            </>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          <div className="card p-4">
            <label className="mb-1 block text-sm" style={{ color: 'var(--ink-soft)' }}>家里现有的食材</label>
            <textarea value={fridge} onChange={(e) => setFridge(e.target.value)}
              rows={3} placeholder="比如：鸡蛋、西兰花、豆腐、鲈鱼、胡萝卜"
              className="mb-3 w-full rounded-xl border bg-white px-3 py-2 text-sm" style={{ borderColor: 'var(--line)' }} />
            <Button onClick={genFridge} disabled={fridgeLoading} className="w-full">
              {fridgeLoading ? <Spinner label="AI 思考中…" /> : '看看能做什么菜'}
            </Button>
          </div>

          {dishes && (
            <div className="space-y-2">
              {dishes.map((d, i) => (
                <div key={i} className="card p-4">
                  <h4 className="mb-1 font-semibold">{d.title}</h4>
                  <p className="mb-2 text-sm" style={{ color: 'var(--ink-soft)' }}>{d.reason}</p>
                  {d.missing && d.missing.length > 0 && (
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-xs" style={{ color: 'var(--ink-soft)' }}>还需补买：</span>
                      {d.missing.map((m, j) => (
                        <span key={j} className="chip px-2.5 py-0.5 text-xs">{m}</span>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
      <Toast msg={toast} />
    </div>
  );
}
