'use client';
import { Suspense, useEffect, useState, useCallback } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import {
  getMeal, upsertMeal, deleteMeal, replaceIngredients, toggleIngredient,
  addPrep, togglePrep, deletePrep, deletePrepsForMeal, getPreps, getMealsBetween,
} from '@/lib/db';
import type { Meal, MealType, Ingredient, Prep } from '@/lib/types';
import { MEAL_LABELS } from '@/lib/types';
import { ymdLabel, addDays, parseYMD, toYMD, startOfWeek, weekDates } from '@/lib/date';
import { Button, Spinner, Toast } from '@/components/ui';
import ConfigBanner from '@/components/ConfigBanner';
import { supabaseReady } from '@/lib/supabase';
import { useAuth } from '@/components/AuthProvider';

function MealEditor() {
  const { user } = useAuth();
  const sp = useSearchParams();
  const router = useRouter();
  const date = sp.get('date') || '';
  const type = (sp.get('type') || 'dinner') as MealType;

  const [meal, setMeal] = useState<Meal | null>(null);
  const [title, setTitle] = useState('');
  const [author, setAuthor] = useState('');
  const [loading, setLoading] = useState(true);
  const [aiLoading, setAiLoading] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [suggestLoading, setSuggestLoading] = useState(false);
  const [suggestion, setSuggestion] = useState<{ dishes: string[]; reason: string; health_note?: string } | null>(null);
  const [extra, setExtra] = useState('');

  function ping(m: string) { setToast(m); setTimeout(() => setToast(null), 2000); }

  const load = useCallback(async () => {
    if (!supabaseReady || !date || !user) { setLoading(false); return; }
    setLoading(true);
    const m = await getMeal(user.username, date, type);
    setMeal(m);
    setTitle(m?.title || '');
    setAuthor(m?.author || '');
    setLoading(false);
  }, [date, type, user]);

  useEffect(() => { load(); }, [load]);

  async function handleSaveAndAnalyze() {
    if (!title.trim()) { ping('先写下想吃的菜'); return; }
    setAiLoading(true);
    try {
      // 1) 先保存这一餐
      const saved = await upsertMeal({ owner: user!.username, date, meal_type: type, title: title.trim(), author });
      // 2) 调 AI 分析做法 + 原材料 + 预处理
      const resp = await fetch('/api/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ task: 'recipe', dish: title.trim(), mealLabel: MEAL_LABELS[type], extra: extra.trim(), username: user?.username }),
      });
      const json = await resp.json();
      if (!resp.ok) { ping(json.error || 'AI 调用失败'); await load(); return; }

      const r = json.result;
      await upsertMeal({ owner: user!.username, date, meal_type: type, title: title.trim(), recipe: r.recipe || '', health_note: r.health_note || '', health_conflict: !!r.conflict, author });
      if (Array.isArray(r.ingredients)) {
        await replaceIngredients(saved.id, r.ingredients.map((i: any) => ({
          name: i.name || '', amount: i.amount || '',
        })));
      }
      // 替换/重新分析这一餐前，先清掉旧的预处理提醒，保持同步
      await deletePrepsForMeal(saved.id);
      // 预处理：按 AI 给的 when 决定哪天处理（same=当天 / prev=前一晚），time 用于排序
      if (Array.isArray(r.preps) && r.preps.length) {
        for (const p of r.preps) {
          const prepDate = p.when === 'prev'
            ? toYMD(addDays(parseYMD(date), -1))
            : date;
          await addPrep({
            owner: user!.username, meal_id: saved.id, prep_date: prepDate,
            prep_time: typeof p.time === 'string' ? p.time : null,
            item: p.item || '', kind: p.kind === 'defrost' ? 'defrost' : 'prep',
          });
        }
      }
      await load();
      ping('已生成做法与采购清单 ✓');
    } catch (e: any) {
      ping('出错：' + (e?.message || ''));
    } finally { setAiLoading(false); }
  }

  async function handleSaveOnly() {
    if (!title.trim()) { ping('先写下菜名'); return; }
    await upsertMeal({ owner: user!.username, date, meal_type: type, title: title.trim(), recipe: meal?.recipe || '', author });
    await load();
    ping('已保存 ✓');
  }

  // 换一道菜：让 AI 推荐一个新菜，避开本周其它餐
  async function handleSuggest() {
    setSuggestLoading(true);
    try {
      // 收集本周所有已安排的菜名（排除当前这一餐）
      const ws = startOfWeek(parseYMD(date));
      const wdates = weekDates(ws);
      const weekMeals = await getMealsBetween(user!.username, wdates[0], wdates[6]);
      const existing = weekMeals
        .filter((m) => !(m.date === date && m.meal_type === type))
        .map((m) => m.title)
        .filter(Boolean);
      const resp = await fetch('/api/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ task: 'suggest-dish', mealLabel: MEAL_LABELS[type], existingDishes: existing, extra: extra.trim(), username: user?.username }),
      });
      const json = await resp.json();
      if (!resp.ok) { ping(json.error || 'AI 推荐失败'); return; }
      const ds = Array.isArray(json.result.dishes)
        ? json.result.dishes.filter((x: any) => typeof x === 'string' && x.trim())
        : (json.result.title ? [json.result.title] : []);
      setSuggestion({ dishes: ds, reason: json.result.reason || '', health_note: json.result.health_note || '' });
    } catch (e: any) {
      ping('出错：' + (e?.message || ''));
    } finally { setSuggestLoading(false); }
  }

  // 采用推荐：填入输入框，清掉旧的做法/食材关联留待重新分析
  function acceptSuggestion() {
    if (!suggestion || !suggestion.dishes.length) return;
    setTitle(suggestion.dishes.join('、'));
    setSuggestion(null);
    ping('已填入整顿菜，可点「保存并让 AI 分析」出做法');
  }

  async function handleDelete() {
    if (!meal) { router.push('/'); return; }
    if (!confirm('确定删除这一餐的全部记录？')) return;
    await deleteMeal(meal.id);
    router.push('/');
  }

  async function onToggleIng(ing: Ingredient) {
    await toggleIngredient(ing.id, !ing.bought);
    await load();
  }
  async function onTogglePrep(p: Prep) {
    await togglePrep(p.id, !p.done);
    await load();
  }

  if (!date) return <div className="card p-4 text-sm">缺少日期参数。<button className="underline" onClick={() => router.push('/')}>返回</button></div>;

  const ingredients = meal?.ingredients || [];
  const preps = meal?.preps || [];

  return (
    <div>
      <button onClick={() => router.back()} className="mb-3 text-sm" style={{ color: 'var(--ink-soft)' }}>‹ 返回</button>
      <div className="mb-1 text-sm" style={{ color: 'var(--ink-soft)' }}>{ymdLabel(date)} · {MEAL_LABELS[type]}</div>
      <ConfigBanner />

      {loading ? <Spinner label="加载中…" /> : (
        <div className="space-y-4">
          <section className="card p-4">
            <label className="mb-1 block text-sm" style={{ color: 'var(--ink-soft)' }}>想吃的菜</label>
            <input value={title} onChange={(e) => setTitle(e.target.value)}
              placeholder="比如：清蒸鲈鱼"
              className="mb-3 w-full rounded-xl border bg-white px-3 py-2 text-base"
              style={{ borderColor: 'var(--line)' }} />
            <label className="mb-1 block text-sm" style={{ color: 'var(--ink-soft)' }}>记录人（可选）</label>
            <input value={author} onChange={(e) => setAuthor(e.target.value)}
              placeholder="老公 / 老婆"
              className="mb-4 w-full rounded-xl border bg-white px-3 py-2 text-sm"
              style={{ borderColor: 'var(--line)' }} />
            <div className="flex gap-2">
              <Button onClick={handleSaveAndAnalyze} disabled={aiLoading} className="flex-1">
                {aiLoading ? <Spinner label="AI 分析中…" /> : '保存并让 AI 分析'}
              </Button>
              <Button variant="soft" onClick={handleSaveOnly} disabled={aiLoading}>仅保存</Button>
            </div>

            <div className="mt-3 border-t pt-3" style={{ borderColor: 'var(--line)' }}>
              <span className="mb-2 block text-sm" style={{ color: 'var(--ink-soft)' }}>不喜欢这一餐？换一道（可填要求，也可留空）</span>
              <input value={extra} onChange={(e) => setExtra(e.target.value)}
                placeholder="可选：比如想喝汤、想吃鱼、清爽点…"
                className="mb-2 w-full rounded-xl border bg-white px-3 py-2 text-sm" style={{ borderColor: 'var(--line)' }} />
              <Button variant="soft" onClick={handleSuggest} disabled={suggestLoading || aiLoading} className="w-full">
                {suggestLoading ? <Spinner label="AI 想菜中…" /> : '🔄 换一道菜'}
              </Button>
              {suggestion && (
                <div className="mt-3 rounded-xl p-3" style={{ background: 'var(--surface-2)', border: '1px solid var(--line)' }}>
                  <div className="mb-1 flex flex-wrap gap-1.5">
                    {suggestion.dishes.map((d, idx) => (
                      <span key={idx} className="rounded-lg px-2 py-0.5 text-sm font-semibold"
                        style={{ background: 'var(--surface)', color: 'var(--ink)' }}>{d}</span>
                    ))}
                  </div>
                  <p className="mb-2 text-sm" style={{ color: 'var(--ink-soft)' }}>{suggestion.reason}</p>
                  {suggestion.health_note && (
                    <p className="mb-3 rounded-lg px-2.5 py-2 text-xs leading-relaxed" style={{ background: 'rgba(138,154,91,0.15)', color: 'var(--ink)' }}>
                      <span style={{ color: 'var(--accent-2)' }}>💚 健康说明：</span>{suggestion.health_note}
                    </p>
                  )}
                  <div className="flex gap-2">
                    <Button onClick={acceptSuggestion} className="flex-1">采用这顿</Button>
                    <Button variant="soft" onClick={handleSuggest} disabled={suggestLoading}>再换一个</Button>
                    <Button variant="ghost" onClick={() => setSuggestion(null)}>取消</Button>
                  </div>
                </div>
              )}
            </div>
          </section>

          {meal?.recipe && (
            <section className="card p-4">
              <h3 className="mb-2 font-semibold">做法</h3>
              <p className="whitespace-pre-wrap text-sm leading-relaxed" style={{ color: 'var(--ink)' }}>{meal.recipe}</p>
            </section>
          )}

          {meal?.health_note && (
            meal.health_conflict ? (
              <section className="card p-4" style={{ background: 'rgba(200,80,80,0.10)', border: '1px solid var(--danger)' }}>
                <h3 className="mb-2 font-semibold" style={{ color: 'var(--danger)' }}>⚠️ 健康警示</h3>
                <p className="text-sm leading-relaxed" style={{ color: 'var(--danger)' }}>{meal.health_note}</p>
              </section>
            ) : (
              <section className="card p-4" style={{ background: 'rgba(138,154,91,0.10)' }}>
                <h3 className="mb-2 font-semibold" style={{ color: 'var(--accent-2)' }}>💚 健康说明</h3>
                <p className="text-sm leading-relaxed" style={{ color: 'var(--ink)' }}>{meal.health_note}</p>
              </section>
            )
          )}

          {ingredients.length > 0 && (
            <section className="card p-4">
              <h3 className="mb-3 font-semibold">采购清单 <span className="text-xs font-normal" style={{ color: 'var(--ink-soft)' }}>买完打勾</span></h3>
              <ul className="space-y-1.5">
                {ingredients.map((ing) => (
                  <li key={ing.id}>
                    <button onClick={() => onToggleIng(ing)}
                      className="flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left transition hover:bg-black/[0.02]">
                      <span className="flex h-5 w-5 items-center justify-center rounded-md border text-xs"
                        style={{
                          borderColor: ing.bought ? 'var(--accent-2)' : 'var(--line)',
                          background: ing.bought ? 'var(--accent-2)' : 'transparent',
                          color: '#fff',
                        }}>{ing.bought ? '✓' : ''}</span>
                      <span className="flex-1 text-sm" style={{
                        color: ing.bought ? 'var(--ink-soft)' : 'var(--ink)',
                        textDecoration: ing.bought ? 'line-through' : 'none',
                      }}>{ing.name}</span>
                      <span className="text-xs" style={{ color: 'var(--ink-soft)' }}>{ing.amount}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {preps.length > 0 && (
            <section className="card p-4">
              <h3 className="mb-3 font-semibold">需提前一天准备</h3>
              <ul className="space-y-1.5">
                {preps.map((p) => (
                  <li key={p.id}>
                    <button onClick={() => onTogglePrep(p)}
                      className="flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left transition hover:bg-black/[0.02]">
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
                      <span className="text-xs" style={{ color: 'var(--ink-soft)' }}>{ymdLabel(p.prep_date)}做</span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {meal && (
            <Button variant="danger" onClick={handleDelete} className="w-full">删除这一餐</Button>
          )}
        </div>
      )}
      <Toast msg={toast} />
    </div>
  );
}

export default function MealPage() {
  return (
    <Suspense fallback={<Spinner label="加载中…" />}>
      <MealEditor />
    </Suspense>
  );
}
