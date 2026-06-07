'use client';
import { useEffect, useState } from 'react';
import { getSettings, saveSettings, changePassword, getUserPrefs, saveUserPrefs } from '@/lib/db';
import type { Settings, Prefs } from '@/lib/types';
import { Button, SectionTitle, Spinner, Toast } from '@/components/ui';
import ConfigBanner from '@/components/ConfigBanner';
import { useAuth } from '@/components/AuthProvider';
import { supabaseReady } from '@/lib/supabase';

const COMMON_AVOID = ['菌菇', '香菜', '内脏', '芹菜', '羊肉', '海鲜'];

export default function SettingsPage() {
  const [s, setS] = useState<Settings | null>(null);
  const auth = useAuth();
  const [oldPwd, setOldPwd] = useState('');
  const [newPwd, setNewPwd] = useState('');
  const [pwdBusy, setPwdBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [avoidInput, setAvoidInput] = useState('');
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; msg: string } | null>(null);

  useEffect(() => {
    if (!supabaseReady) { setLoading(false); return; }
    (async () => {
      const d = await getSettings();
      if (d && auth.user) {
        // 健康/口味偏好读当前用户的（每个账号独立）
        const userPrefs = await getUserPrefs(auth.user.username);
        setS({ ...d, prefs: userPrefs });
      } else {
        setS(d);
      }
      setLoading(false);
    })();
  }, [auth.user]);

  function ping(m: string) { setToast(m); setTimeout(() => setToast(null), 1800); }

  async function onChangePwd() {
    if (!auth.user) { ping('请先登录'); return; }
    if (!oldPwd || !newPwd) { ping('请填写旧密码和新密码'); return; }
    if (newPwd.length < 4) { ping('新密码至少 4 位'); return; }
    setPwdBusy(true);
    try {
      const r = await changePassword(auth.user.username, oldPwd, newPwd);
      if (!r.ok) { ping(r.error || '修改失败'); return; }
      setOldPwd(''); setNewPwd('');
      ping('密码已修改 ✓');
    } finally { setPwdBusy(false); }
  }


  async function onTestAI() {
    if (!s) return;
    if (!s.ai_api_key.trim()) { setTestResult({ ok: false, msg: '请先填写 API Key' }); return; }
    setTesting(true); setTestResult(null);
    try {
      // 先把当前填写的 AI 配置保存，再测试（确保测的是最新值）
      await saveSettings({ ai_api_key: s.ai_api_key, ai_base_url: s.ai_base_url, ai_model: s.ai_model });
      const resp = await fetch('/api/ai', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ task: 'test' }),
      });
      const json = await resp.json();
      if (json.ok) {
        setTestResult({ ok: true, msg: `配置成功 ✓ 模型「${json.model}」已连通` });
      } else {
        setTestResult({ ok: false, msg: json.error || '测试失败' });
      }
    } catch (e: any) {
      setTestResult({ ok: false, msg: '测试出错：' + (e?.message || '') });
    } finally { setTesting(false); }
  }

  function setPrefs(patch: Partial<Prefs>) {
    if (!s) return;
    setS({ ...s, prefs: { ...s.prefs, ...patch } });
  }

  async function onSave() {
    if (!s) return;
    setSaving(true);
    try {
      // AI 配置（key/url/model）全局共享，所有家人共用一套
      await saveSettings({
        ai_api_key: s.ai_api_key, ai_base_url: s.ai_base_url, ai_model: s.ai_model,
      });
      // 健康/口味偏好按账号独立保存
      if (auth.user) await saveUserPrefs(auth.user.username, s.prefs);
      ping('已保存 ✓');
    } catch (e: any) {
      ping('保存失败：' + (e?.message || ''));
    } finally { setSaving(false); }
  }

  function addAvoid(name: string) {
    const v = name.trim();
    if (!v || !s) return;
    if (!s.prefs.avoid.includes(v)) setPrefs({ avoid: [...s.prefs.avoid, v] });
    setAvoidInput('');
  }
  function removeAvoid(name: string) {
    if (!s) return;
    setPrefs({ avoid: s.prefs.avoid.filter((a) => a !== name) });
  }

  return (
    <div>
      <SectionTitle>设置</SectionTitle>
      <ConfigBanner />

      {!supabaseReady ? (
        <div className="card p-4 text-sm" style={{ color: 'var(--ink-soft)', lineHeight: 1.7 }}>
          <p className="mb-2 font-medium" style={{ color: 'var(--ink)' }}>连接 Supabase 的步骤：</p>
          <ol className="list-decimal space-y-1 pl-5">
            <li>到 supabase.com 注册并新建一个免费项目</li>
            <li>打开 SQL Editor，把项目里的 supabase-schema.sql 整段粘贴运行</li>
            <li>到 Project Settings → API 复制 URL 和 anon key</li>
            <li>把根目录的 .env.local.example 改名为 .env.local 并填入这两个值</li>
            <li>重启开发服务器</li>
          </ol>
        </div>
      ) : loading ? (
        <Spinner label="加载中…" />
      ) : !s ? (
        <div className="card p-4 text-sm" style={{ color: 'var(--danger)' }}>
          读取设置失败。请确认已在 Supabase 运行 supabase-schema.sql。
        </div>
      ) : (
        <div className="space-y-5">
          <section className="card p-4">
            <h3 className="mb-3 font-semibold">AI 接入</h3>
            <label className="mb-1 block text-sm" style={{ color: 'var(--ink-soft)' }}>API Key</label>
            <input type="password" value={s.ai_api_key}
              onChange={(e) => setS({ ...s, ai_api_key: e.target.value })}
              placeholder="sk-..." className="mb-3 w-full rounded-xl border bg-white px-3 py-2 text-sm"
              style={{ borderColor: 'var(--line)' }} />
            <label className="mb-1 block text-sm" style={{ color: 'var(--ink-soft)' }}>API URL（兼容 OpenAI 格式，到 /v1）</label>
            <input value={s.ai_base_url}
              onChange={(e) => setS({ ...s, ai_base_url: e.target.value })}
              placeholder="https://api.openai.com/v1" className="mb-3 w-full rounded-xl border bg-white px-3 py-2 text-sm"
              style={{ borderColor: 'var(--line)' }} />
            <label className="mb-1 block text-sm" style={{ color: 'var(--ink-soft)' }}>模型</label>
            <input value={s.ai_model}
              onChange={(e) => setS({ ...s, ai_model: e.target.value })}
              placeholder="gpt-4o-mini" className="mb-3 w-full rounded-xl border bg-white px-3 py-2 text-sm"
              style={{ borderColor: 'var(--line)' }} />
            <Button variant="soft" onClick={onTestAI} disabled={testing} className="w-full">
              {testing ? <Spinner label="测试中…" /> : '测试 AI 是否配置成功'}
            </Button>
            {testResult && (
              <p className="mt-2 rounded-lg px-3 py-2 text-xs leading-relaxed"
                style={{
                  background: testResult.ok ? 'rgba(138,154,91,0.15)' : 'rgba(200,80,80,0.12)',
                  color: testResult.ok ? 'var(--accent-2)' : 'var(--danger)',
                }}>
                {testResult.msg}
              </p>
            )}
          </section>

          <section className="card p-4">
            <h3 className="mb-3 font-semibold">口味与健康</h3>
            <label className="mb-1 block text-sm" style={{ color: 'var(--ink-soft)' }}>菜系偏好</label>
            <input value={s.prefs.cuisine}
              onChange={(e) => setPrefs({ cuisine: e.target.value })}
              className="mb-4 w-full rounded-xl border bg-white px-3 py-2 text-sm"
              style={{ borderColor: 'var(--line)' }} />

            <div className="mb-4 flex items-center justify-between">
              <span className="text-sm">能吃辣</span>
              <button onClick={() => setPrefs({ spicy: !s.prefs.spicy })}
                className="relative h-7 w-12 rounded-full transition"
                style={{ background: s.prefs.spicy ? 'var(--accent)' : 'var(--surface-2)', border: '1px solid var(--line)' }}>
                <span className="absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all"
                  style={{ left: s.prefs.spicy ? '24px' : '3px' }} />
              </button>
            </div>

            <label className="mb-1 block text-sm" style={{ color: 'var(--ink-soft)' }}>忌口食材</label>
            <div className="mb-2 flex flex-wrap gap-2">
              {s.prefs.avoid.map((a) => (
                <span key={a} className="chip flex items-center gap-1 px-3 py-1 text-sm">
                  {a}
                  <button onClick={() => removeAvoid(a)} style={{ color: 'var(--ink-soft)' }}>×</button>
                </span>
              ))}
            </div>
            <div className="mb-2 flex flex-wrap gap-1.5">
              {COMMON_AVOID.filter((c) => !s.prefs.avoid.includes(c)).map((c) => (
                <button key={c} onClick={() => addAvoid(c)}
                  className="chip px-2.5 py-1 text-xs" style={{ color: 'var(--ink-soft)' }}>+ {c}</button>
              ))}
            </div>
            <div className="mb-4 flex gap-2">
              <input value={avoidInput} onChange={(e) => setAvoidInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && addAvoid(avoidInput)}
                placeholder="自定义忌口后回车" className="flex-1 rounded-xl border bg-white px-3 py-2 text-sm"
                style={{ borderColor: 'var(--line)' }} />
              <Button variant="soft" onClick={() => addAvoid(avoidInput)}>添加</Button>
            </div>

            <label className="mb-1 block text-sm" style={{ color: 'var(--ink-soft)' }}>健康状况说明</label>
            <textarea value={s.prefs.health}
              onChange={(e) => setPrefs({ health: e.target.value })}
              rows={2} className="mb-4 w-full rounded-xl border bg-white px-3 py-2 text-sm"
              style={{ borderColor: 'var(--line)' }} />

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-sm" style={{ color: 'var(--ink-soft)' }}>红肉每周最多几顿</label>
                <input type="number" value={s.prefs.redMeatMaxMeals}
                  onChange={(e) => setPrefs({ redMeatMaxMeals: Number(e.target.value) })}
                  className="w-full rounded-xl border bg-white px-3 py-2 text-sm" style={{ borderColor: 'var(--line)' }} />
              </div>
              <div>
                <label className="mb-1 block text-sm" style={{ color: 'var(--ink-soft)' }}>红肉每周最多(克)</label>
                <input type="number" value={s.prefs.redMeatMaxGrams}
                  onChange={(e) => setPrefs({ redMeatMaxGrams: Number(e.target.value) })}
                  className="w-full rounded-xl border bg-white px-3 py-2 text-sm" style={{ borderColor: 'var(--line)' }} />
              </div>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-sm" style={{ color: 'var(--ink-soft)' }}>几人吃饭</label>
                <input type="number" min={1} value={s.prefs.peopleCount}
                  onChange={(e) => setPrefs({ peopleCount: Math.max(1, Number(e.target.value) || 1) })}
                  className="w-full rounded-xl border bg-white px-3 py-2 text-sm" style={{ borderColor: 'var(--line)' }} />
              </div>
              <div>
                <label className="mb-1 block text-sm" style={{ color: 'var(--ink-soft)' }}>吃几分饱（1-10）</label>
                <input type="number" min={1} max={10} value={s.prefs.fullness}
                  onChange={(e) => setPrefs({ fullness: Math.min(10, Math.max(1, Number(e.target.value) || 8)) })}
                  className="w-full rounded-xl border bg-white px-3 py-2 text-sm" style={{ borderColor: 'var(--line)' }} />
              </div>
            </div>
            <p className="mt-2 text-xs" style={{ color: 'var(--ink-soft)' }}>
              人数和分饱程度会用于 AI 生成菜谱时计算份量，保证够吃。
            </p>
          </section>

          {auth.user && (
            <section className="card p-4">
              <h3 className="mb-3 font-semibold">账号</h3>
              <p className="mb-3 text-sm" style={{ color: 'var(--ink-soft)' }}>
                当前登录：<span style={{ color: 'var(--ink)' }}>{auth.user.display_name || auth.user.username}</span>
              </p>
              <label className="mb-1 block text-sm" style={{ color: 'var(--ink-soft)' }}>旧密码</label>
              <input type="password" value={oldPwd} onChange={(e) => setOldPwd(e.target.value)}
                className="mb-3 w-full rounded-xl border bg-white px-3 py-2 text-sm" style={{ borderColor: 'var(--line)' }} />
              <label className="mb-1 block text-sm" style={{ color: 'var(--ink-soft)' }}>新密码</label>
              <input type="password" value={newPwd} onChange={(e) => setNewPwd(e.target.value)}
                className="mb-3 w-full rounded-xl border bg-white px-3 py-2 text-sm" style={{ borderColor: 'var(--line)' }} />
              <div className="flex gap-2">
                <Button variant="soft" onClick={onChangePwd} disabled={pwdBusy} className="flex-1">
                  {pwdBusy ? '修改中…' : '修改密码'}
                </Button>
                <Button variant="danger" onClick={() => auth.signOut()}>退出登录</Button>
              </div>
            </section>
          )}

          <Button onClick={onSave} disabled={saving} className="w-full">
            {saving ? '保存中…' : '保存设置'}
          </Button>
        </div>
      )}
      <Toast msg={toast} />
    </div>
  );
}
