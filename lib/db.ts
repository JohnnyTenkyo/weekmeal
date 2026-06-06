import { supabase } from './supabase';
import type { Settings, Meal, Ingredient, Prep, MealType } from './types';

// ---------------- Settings ----------------
export async function getSettings(): Promise<Settings | null> {
  const { data, error } = await supabase.from('settings').select('*').eq('id', 1).single();
  if (error) { console.error(error); return null; }
  return data as Settings;
}

export async function saveSettings(patch: Partial<Settings>): Promise<void> {
  const { error } = await supabase
    .from('settings')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', 1);
  if (error) throw error;
}

// ---------------- Meals ----------------
export async function getMealsBetween(startYMD: string, endYMD: string): Promise<Meal[]> {
  const { data, error } = await supabase
    .from('meals')
    .select('*, ingredients(*), preps(*)')
    .gte('date', startYMD)
    .lte('date', endYMD)
    .order('date');
  if (error) { console.error(error); return []; }
  return (data || []) as Meal[];
}

export async function getMeal(date: string, mealType: MealType): Promise<Meal | null> {
  const { data, error } = await supabase
    .from('meals')
    .select('*, ingredients(*), preps(*)')
    .eq('date', date)
    .eq('meal_type', mealType)
    .maybeSingle();
  if (error) { console.error(error); return null; }
  return data as Meal | null;
}

// 创建或更新某餐（按 date+meal_type 唯一）
export async function upsertMeal(m: {
  date: string; meal_type: MealType; title: string; recipe?: string; author?: string;
}): Promise<Meal> {
  const { data, error } = await supabase
    .from('meals')
    .upsert(
      { date: m.date, meal_type: m.meal_type, title: m.title, recipe: m.recipe ?? '', author: m.author ?? '' },
      { onConflict: 'date,meal_type' }
    )
    .select('*')
    .single();
  if (error) throw error;
  return data as Meal;
}

export async function deleteMeal(id: string): Promise<void> {
  const { error } = await supabase.from('meals').delete().eq('id', id);
  if (error) throw error;
}

// ---------------- Ingredients ----------------
export async function replaceIngredients(
  mealId: string,
  items: { name: string; amount: string }[]
): Promise<void> {
  await supabase.from('ingredients').delete().eq('meal_id', mealId);
  if (items.length === 0) return;
  const rows = items.map((i) => ({ meal_id: mealId, name: i.name, amount: i.amount, bought: false }));
  const { error } = await supabase.from('ingredients').insert(rows);
  if (error) throw error;
}

export async function toggleIngredient(id: string, bought: boolean): Promise<void> {
  const { error } = await supabase.from('ingredients').update({ bought }).eq('id', id);
  if (error) throw error;
}

// ---------------- Preps ----------------
export async function getPreps(date: string): Promise<Prep[]> {
  const { data, error } = await supabase
    .from('preps')
    .select('*')
    .eq('prep_date', date)
    .order('created_at');
  if (error) { console.error(error); return []; }
  return (data || []) as Prep[];
}

export async function addPrep(p: {
  meal_id?: string | null; prep_date: string; item: string; kind: 'defrost' | 'prep';
}): Promise<void> {
  const { error } = await supabase.from('preps').insert({
    meal_id: p.meal_id ?? null, prep_date: p.prep_date, item: p.item, kind: p.kind, done: false,
  });
  if (error) throw error;
}

export async function togglePrep(id: string, done: boolean): Promise<void> {
  const { error } = await supabase.from('preps').update({ done }).eq('id', id);
  if (error) throw error;
}

export async function deletePrep(id: string): Promise<void> {
  const { error } = await supabase.from('preps').delete().eq('id', id);
  if (error) throw error;
}
