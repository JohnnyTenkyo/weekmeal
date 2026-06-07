'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { upsertMeal, getUserPrefs, replaceIngredients, addPrep, deletePrepsForMeal, getMealsBetween } from '@/lib/db';
import type { MealType } from '@/lib/types';
import { MEAL_TYPES, MEAL_LABELS } from '@/lib/types';
import { startOfWeek, weekDates, ymdLabel, WEEK_LABELS, addDays, todayYMD, parseYMD, toYMD } from '@/lib/date';
import { Button, SectionTitle, Spinner, Toast } from '@/components/ui';
import ConfigBanner from '@/components/ConfigBanner';
import { supabaseReady } from '@/lib/supabase';
import { useAuth } from '@/components/AuthProvider';
import type { Prefs } from '@/lib/types';

interface DayPlan { date: string; breakfast: string; lunch: string; dinner: string; }
interface DishRec { title: string; reason: string; missing: string[]; }

export default function DiscoverPage() {
  const router = useRouter();
  const { user } = useAuth();
  const [tab, setTab] = useState<'week' | 'fridge'>('week');
  const [prefs, setPrefsState] = useState<Prefs | null>(null);

  useEffect(() => {
    if (!supabaseReady || !user) return;
    getUserPrefs(user.username).then(setPrefsState);
  }, [user]);
  const [toast, setToast] = useState<string | null>(null);
  function ping(m: string) { setToast(m); setTimeout(() => setToast(null), 2000); }

  // 一周计划：分本周(0)/下周(1)
  const [planLoading, setPlanLoading] = useState<0 | 1 | null>(null);
  const [plan, setPlan] = useState<DayPlan[] | null>(null);
  const [planTarget, setPlanTarget] = useState<0 | 1>(0); // 当前生成的是本周还是下周
  const [saving, setSaving] = useState(false);
  const [confirmOverwrite, setConfirmOverwrite] = useState<{ count: number } | null>(null);

  // 冰箱反推
  const [fridge, setFridge] = useState('');
  const [fridgeLoading, setFridgeLoading] = useState(false);
  const [dishes, setDishes] = useState<DishRec[] | null>(null);
  // 把推荐菜加入某天某餐
  const [addSel, setAddSel] = useState<Record<number, { date: string; type: MealType }>>({});
  const [addingIdx, setAddingIdx] = useState<number | null>(null);

  // 未来 7 天可选日期（今天起）
  const dayOptions = Array.from({ length: 7 }, (_, i) => toYMD(addDays(parseYMD(todayYMD()), i)));

  function selFor(i: number) {
    return addSel[i] || { date: dayOptions[0], type: 'dinner' as MealType };
  }
  function setSel(i: number, patch: Partial<{ date: string; type: MealType }>) {
    setAddSel((prev) => ({ ...prev, [i]: { ...selFor(i), ...patch } }));
  }

  // 用现有食材做这道菜并覆盖到选定的那一餐
  async function addDishToMeal(i: number, dish: DishRec) {
    const sel = selFor(i);
    setAddingIdx(i);
    try {
      const resp = await fetch('/api/ai', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          task: 'dish-from-given', dish: dish.title, available: fridge.trim(),
          mealLabel: MEAL_LABELS[sel.type], username: user?.username,
        }),
      });
      const json = await resp.json();
      if (!resp.ok) { ping(json.error || '生成失败'); return; }
      const r = json.result;
      // 覆盖那一餐
      const saved = await upsertMeal({
        owner: user!.username, date: sel.date, meal_type: sel.type,
        title: dish.title, recipe: r.recipe || '', health_note: r.health_note || '', author: 'AI',
      });
      if (Array.isArray(r.ingredients)) {
        await replaceIngredients(saved.id, r.ingredients.map((x: any) => ({ name: x.name || '', amount: x.amount || '' })));
      }
      // 覆盖那一餐：先清旧预处理，保持同步
      await deletePrepsForMeal(saved.id);
      if (Array.isArray(r.preps) && r.preps.length) {
        const prepDate = toYMD(addDays(parseYMD(sel.date), -1));
        for (const pp of r.preps) {
          await addPrep({
            owner: user!.username, meal_id: saved.id, prep_date: prepDate,
            item: pp.item || '', kind: pp.kind === 'defrost' ? 'defrost' : 'prep',
          });
        }
      }
      ping(`已加入 ${ymdLabel(sel.date)} ${MEAL_LABELS[sel.type]} ✓`);
    } catch (e: any) {
      ping('出错：' + (e?.message || ''));
    } finally { setAddingIdx(null); }
  }

  function weekStartFor(target: 0 | 1): Date {
    const base = startOfWeek(new Date());
    return target === 1 ? startOfWeek(addDays(base, 7)) : base;
  }

  async function genWeek(target: 0 | 1) {
    setPlanLoading(target); setPlan(null); setPlanTarget(target);
    try {
      const dates = weekDates(weekStartFor(target));
      const resp = await fetch('/api/ai', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ task: 'weekplan', weekDates: dates, username: user?.username }),
      });
      const json = await resp.json();
      if (!resp.ok) { ping(json.error || '生成失败'); return; }
      setPlan(json.result.days as DayPlan[]);
    } catch (e: any) { ping('出错：' + (e?.message || '')); }
    finally { setPlanLoading(null); }
  }

  // 点「采用并写入」：先看这一周是否已有菜，有则弹确认覆盖
  async function applyWeek() {
    if (!plan || !user) return;
    setSaving(true);
    try {
      const dates = plan.map((d) => d.date);
      const existing = await getMealsBetween(user.username, dates[0], dates[dates.length - 1]);
      const hasExisting = existing.filter((m) => m.title && m.title.trim()).length;
      if (hasExisting > 0) {
        setSaving(false);
        setConfirmOverwrite({ count: hasExisting });
        return; // 等用户确认
      }
      setSaving(false);
      await doApplyWeek();
    } catch (e: any) {
      ping('写入失败：' + (e?.message || ''));
      setSaving(false);
    }
  }

  // 真正写入：干净覆盖（菜名 + 清掉旧做法/健康说明/采购清单/预处理）
  async function doApplyWeek() {
    if (!plan) return;
    setConfirmOverwrite(null);
    setSaving(true);
    try {
      for (const d of plan) {
        const entries: [MealType, string][] = [
          ['breakfast', d.breakfast], ['lunch', d.lunch], ['dinner', d.dinner],
        ];
        for (const [type, title] of entries) {
          if (title && title.trim()) {
            // recipe/health_note 不传 => 置空；再清掉旧采购清单和预处理，彻底替换
            const saved = await upsertMeal({
              owner: user!.username, date: d.date, meal_type: type,
              title: title.trim(), health_note: '', health_conflict: false, author: 'AI',
            });
            await replaceIngredients(saved.id, []);
            await deletePrepsForMeal(saved.id);
          }
        }
      }
      ping(planTarget === 1 ? '已写入下周菜单 ✓' : '已写入本周菜单 ✓');
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
        body: JSON.stringify({ task: 'from-ingredients', ingredients: fridge.trim(), username: user?.username }),
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
            <p className="mb-1 text-sm" style={{ color: 'var(--ink-soft)' }}>按你保存的健康偏好生成三餐：</p>
            <ul className="mb-3 space-y-0.5 text-xs" style={{ color: 'var(--ink-soft)' }}>
              {prefs ? (
                <>
                  <li>· 口味：{prefs.cuisine || '不限'}{prefs.spicy ? '、可吃辣' : '、不吃辣'}</li>
                  {prefs.avoid && prefs.avoid.length > 0 && <li>· 忌口：{prefs.avoid.join('、')}</li>}
                  {prefs.health && <li>· 健康：{prefs.health}</li>}
                  <li>· 红肉：每周最多 {prefs.redMeatMaxMeals} 顿 / {prefs.redMeatMaxGrams} 克</li>
                </>
              ) : (
                <li>· 读取偏好中…（可在「设置」里修改）</li>
              )}
            </ul>
            <div className="flex gap-2">
              <Button onClick={() => genWeek(0)} disabled={planLoading !== null} className="flex-1">
                {planLoading === 0 ? <Spinner label="规划中…" /> : '✨ 生成本周三餐'}
              </Button>
              <Button onClick={() => genWeek(1)} disabled={planLoading !== null} variant="soft" className="flex-1">
                {planLoading === 1 ? <Spinner label="规划中…" /> : '✨ 生成下周三餐'}
              </Button>
            </div>
          </div>

          {plan && (
            <>
              <p className="text-center text-sm font-medium" style={{ color: 'var(--accent)' }}>
                {planTarget === 1 ? '下周三餐方案' : '本周三餐方案'}
              </p>
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
                {saving ? '写入中…' : (planTarget === 1 ? '采用并写入下周菜单' : '采用并写入本周菜单')}
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
              {dishes.map((d, i) => {
                const sel = selFor(i);
                return (
                <div key={i} className="card p-4">
                  <h4 className="mb-1 font-semibold">{d.title}</h4>
                  <p className="mb-2 text-sm" style={{ color: 'var(--ink-soft)' }}>{d.reason}</p>
                  {d.missing && d.missing.length > 0 && (
                    <div className="mb-3 flex flex-wrap items-center gap-1.5">
                      <span className="text-xs" style={{ color: 'var(--ink-soft)' }}>还需补买：</span>
                      {d.missing.map((m, j) => (
                        <span key={j} className="chip px-2.5 py-0.5 text-xs">{m}</span>
                      ))}
                    </div>
                  )}
                  <div className="mt-2 border-t pt-3" style={{ borderColor: 'var(--line)' }}>
                    <p className="mb-2 text-xs" style={{ color: 'var(--ink-soft)' }}>加入到哪一餐（会覆盖那一餐，只用你现有的食材按人数做够）</p>
                    <div className="flex gap-2">
                      <select value={sel.date} onChange={(e) => setSel(i, { date: e.target.value })}
                        className="flex-1 rounded-xl border bg-white px-2 py-2 text-sm" style={{ borderColor: 'var(--line)' }}>
                        {dayOptions.map((dt, k) => (
                          <option key={dt} value={dt}>{k === 0 ? '今天' : k === 1 ? '明天' : ymdLabel(dt)}</option>
                        ))}
                      </select>
                      <select value={sel.type} onChange={(e) => setSel(i, { type: e.target.value as MealType })}
                        className="rounded-xl border bg-white px-2 py-2 text-sm" style={{ borderColor: 'var(--line)' }}>
                        {MEAL_TYPES.map((t) => (
                          <option key={t} value={t}>{MEAL_LABELS[t]}</option>
                        ))}
                      </select>
                    </div>
                    <Button onClick={() => addDishToMeal(i, d)} disabled={addingIdx !== null} className="mt-2 w-full">
                      {addingIdx === i ? <Spinner label="生成并写入中…" /> : '用现有食材做这道并加入'}
                    </Button>
                  </div>
                </div>
                );
              })}
            </div>
          )}
        </div>
      )}
      {confirmOverwrite && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-6"
          style={{ background: 'rgba(0,0,0,0.35)' }}
          onClick={() => { setConfirmOverwrite(null); setSaving(false); }}>
          <div className="w-full max-w-sm rounded-2xl p-5"
            style={{ background: 'var(--surface)', border: '1px solid var(--line)' }}
            onClick={(e) => e.stopPropagation()}>
            <h3 className="mb-2 text-base font-semibold" style={{ color: 'var(--ink)' }}>覆盖现有菜单？</h3>
            <p className="mb-4 text-sm leading-relaxed" style={{ color: 'var(--ink-soft)' }}>
              {planTarget === 1 ? '下周' : '本周'}已经有 {confirmOverwrite.count} 餐安排了。继续将用这份新方案覆盖，原来的菜名、做法和采购清单都会被替换，确定吗？
            </p>
            <div className="flex gap-2">
              <Button variant="soft" onClick={() => { setConfirmOverwrite(null); setSaving(false); }} className="flex-1">取消</Button>
              <Button variant="danger" onClick={doApplyWeek} disabled={saving} className="flex-1">
                {saving ? '覆盖中…' : '确认覆盖'}
              </Button>
            </div>
          </div>
        </div>
      )}
      <Toast msg={toast} />
    </div>
  );
}
