import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { recipePrompt, weekPlanPrompt, fromIngredientsPrompt, suggestDishPrompt } from '@/lib/ai-prompts';
import type { Prefs } from '@/lib/types';

export const runtime = 'nodejs';

// 服务端拿设置（含 AI Key），不暴露给浏览器
function serverClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
  return createClient(url, anon);
}

// 从模型返回里稳健地抽出 JSON
function extractJson(text: string): any {
  let t = text.trim();
  t = t.replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim();
  const start = t.indexOf('{');
  const end = t.lastIndexOf('}');
  if (start >= 0 && end > start) t = t.slice(start, end + 1);
  return JSON.parse(t);
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { task } = body as { task: string };

    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
      return NextResponse.json({ error: '数据库未配置：请先在项目根目录的 .env.local 填入 Supabase URL 和 anon key 并重启。' }, { status: 400 });
    }
    const sb = serverClient();
    const { data: settings, error } = await sb.from('settings').select('*').eq('id', 1).single();
    if (error || !settings) {
      return NextResponse.json({ error: '无法读取设置，请确认数据库已初始化。' }, { status: 400 });
    }
    const { ai_api_key, ai_base_url, ai_model } = settings;
    const prefs = settings.prefs as Prefs;
    if (!ai_api_key) {
      return NextResponse.json({ error: '尚未在「设置」里填写 AI API Key。' }, { status: 400 });
    }

    let prompt: { system: string; user: string };
    if (task === 'recipe') {
      prompt = recipePrompt(body.dish, prefs);
    } else if (task === 'weekplan') {
      prompt = weekPlanPrompt(prefs, body.weekDates);
    } else if (task === 'from-ingredients') {
      prompt = fromIngredientsPrompt(body.ingredients, prefs);
    } else if (task === 'suggest-dish') {
      prompt = suggestDishPrompt(body.mealLabel, body.existingDishes || [], prefs);
    } else {
      return NextResponse.json({ error: '未知任务类型' }, { status: 400 });
    }

    const base = (ai_base_url || 'https://api.openai.com/v1').replace(/\/$/, '');
    const resp = await fetch(`${base}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${ai_api_key}`,
      },
      body: JSON.stringify({
        model: ai_model || 'gpt-4o-mini',
        messages: [
          { role: 'system', content: prompt.system },
          { role: 'user', content: prompt.user },
        ],
        temperature: 0.7,
      }),
    });

    if (!resp.ok) {
      const errText = await resp.text();
      return NextResponse.json({ error: `AI 接口报错 (${resp.status}): ${errText.slice(0, 300)}` }, { status: 502 });
    }

    const data = await resp.json();
    const content: string = data?.choices?.[0]?.message?.content ?? '';
    let parsed: any;
    try {
      parsed = extractJson(content);
    } catch {
      return NextResponse.json({ error: 'AI 返回的内容无法解析为 JSON', raw: content }, { status: 500 });
    }
    return NextResponse.json({ result: parsed });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || '服务器异常' }, { status: 500 });
  }
}
