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
  date: string; meal_type: MealType; title: string; recipe?: string; author?: string; health_note?: string;
}): Promise<Meal> {
  const row: any = { date: m.date, meal_type: m.meal_type, title: m.title, recipe: m.recipe ?? '', author: m.author ?? '' };
  if (m.health_note !== undefined) row.health_note = m.health_note;
  const { data, error } = await supabase
    .from('meals')
    .upsert(row, { onConflict: 'date,meal_type' })
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

// ---------------- Auth (简易登录，家人共用) ----------------
import type { User } from './types';

// 浏览器端 SHA-256
async function sha256(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

function randomSalt(): string {
  const arr = new Uint8Array(16);
  crypto.getRandomValues(arr);
  return Array.from(arr).map((b) => b.toString(16).padStart(2, '0')).join('');
}

// 登录：校验用户名 + 密码。成功返回 User，失败返回 null
export async function login(username: string, password: string): Promise<User | null> {
  const { data, error } = await supabase
    .from('users').select('*').eq('username', username).maybeSingle();
  if (error || !data) return null;
  const hash = await sha256(password + data.salt);
  if (hash !== data.password_hash) return null;
  return { username: data.username, display_name: data.display_name || '' };
}

// 注册新用户（首次/添加家人）
export async function registerUser(username: string, password: string, displayName: string): Promise<{ ok: boolean; error?: string }> {
  const { data: exist } = await supabase.from('users').select('username').eq('username', username).maybeSingle();
  if (exist) return { ok: false, error: '该用户名已存在' };
  const salt = randomSalt();
  const password_hash = await sha256(password + salt);
  const { error } = await supabase.from('users').insert({ username, salt, password_hash, display_name: displayName });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

// 用旧密码改新密码
export async function changePassword(username: string, oldPassword: string, newPassword: string): Promise<{ ok: boolean; error?: string }> {
  const { data, error } = await supabase.from('users').select('*').eq('username', username).maybeSingle();
  if (error || !data) return { ok: false, error: '用户不存在' };
  const oldHash = await sha256(oldPassword + data.salt);
  if (oldHash !== data.password_hash) return { ok: false, error: '旧密码不正确' };
  const newSalt = randomSalt();
  const newHash = await sha256(newPassword + newSalt);
  const { error: e2 } = await supabase.from('users').update({ salt: newSalt, password_hash: newHash }).eq('username', username);
  if (e2) return { ok: false, error: e2.message };
  return { ok: true };
}

// 是否已存在任何用户（决定首屏是登录还是初始化注册）
export async function hasAnyUser(): Promise<boolean> {
  const { count } = await supabase.from('users').select('username', { count: 'exact', head: true });
  return (count || 0) > 0;
}

// ---------------- 数据保留：清理 2 周前的菜 ----------------
export async function cleanupOldMeals(): Promise<void> {
  try {
    await supabase.rpc('cleanup_old_meals');
  } catch (e) {
    // RPC 不存在时静默跳过（未跑 migration），不影响主流程
    console.warn('cleanup_old_meals 调用失败（可忽略）', e);
  }
}
