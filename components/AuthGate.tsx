'use client';
import { useEffect, useState } from 'react';
import { useAuth } from './AuthProvider';
import { login, registerUser, hasAnyUser } from '@/lib/db';
import { supabaseReady } from '@/lib/supabase';
import { Button, Spinner } from './ui';

export default function AuthGate({ children }: { children: React.ReactNode }) {
  const { user, ready, signIn } = useAuth();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [anyUser, setAnyUser] = useState<boolean | null>(null);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [remember, setRemember] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    if (!supabaseReady) return;
    hasAnyUser().then((has) => {
      setAnyUser(has);
      setMode(has ? 'login' : 'register'); // 没有任何用户时，首屏引导创建第一个账号
    });
  }, []);

  // 未配置数据库：直接放行，让 ConfigBanner 去提示（设置页可用）
  if (!supabaseReady) return <>{children}</>;
  if (!ready) return <div className="flex min-h-screen items-center justify-center"><Spinner label="加载中…" /></div>;
  if (user) return <>{children}</>;

  async function onSubmit() {
    setErr('');
    if (!username.trim() || !password) { setErr('请填写用户名和密码'); return; }
    setBusy(true);
    try {
      if (mode === 'login') {
        const u = await login(username.trim(), password);
        if (!u) { setErr('用户名或密码不正确'); return; }
        signIn(u, remember);
      } else {
        const r = await registerUser(username.trim(), password, displayName.trim() || username.trim());
        if (!r.ok) { setErr(r.error || '创建失败'); return; }
        signIn({ username: username.trim(), display_name: displayName.trim() || username.trim() }, remember);
      }
    } catch (e: any) {
      setErr(e?.message || '出错了');
    } finally { setBusy(false); }
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-6">
      <div className="mb-6 text-center">
        <div className="text-3xl">🍚</div>
        <h1 className="mt-2 text-xl font-semibold" style={{ color: 'var(--ink)' }}>家味·一周菜单</h1>
        <p className="mt-1 text-sm" style={{ color: 'var(--ink-soft)' }}>
          {mode === 'login' ? '登录后和家人共用菜单' : '创建一个账号开始使用'}
        </p>
      </div>

      <div className="card w-full max-w-sm p-5">
        <label className="mb-1 block text-sm" style={{ color: 'var(--ink-soft)' }}>用户名</label>
        <input value={username} onChange={(e) => setUsername(e.target.value)}
          className="mb-3 w-full rounded-xl border bg-white px-3 py-2 text-sm" style={{ borderColor: 'var(--line)' }} />

        {mode === 'register' && (
          <>
            <label className="mb-1 block text-sm" style={{ color: 'var(--ink-soft)' }}>昵称（可选）</label>
            <input value={displayName} onChange={(e) => setDisplayName(e.target.value)}
              placeholder="比如：老公 / 老婆"
              className="mb-3 w-full rounded-xl border bg-white px-3 py-2 text-sm" style={{ borderColor: 'var(--line)' }} />
          </>
        )}

        <label className="mb-1 block text-sm" style={{ color: 'var(--ink-soft)' }}>密码</label>
        <input type="password" value={password} onChange={(e) => setPassword(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && onSubmit()}
          className="mb-3 w-full rounded-xl border bg-white px-3 py-2 text-sm" style={{ borderColor: 'var(--line)' }} />

        <label className="mb-4 flex items-center gap-2 text-sm" style={{ color: 'var(--ink-soft)' }}>
          <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
          记住登录（下次免输入）
        </label>

        {err && <p className="mb-3 text-sm" style={{ color: 'var(--danger)' }}>{err}</p>}

        <Button onClick={onSubmit} disabled={busy} className="w-full">
          {busy ? <Spinner label="处理中…" /> : mode === 'login' ? '登录' : '创建账号'}
        </Button>

        <div className="mt-3 text-center text-sm" style={{ color: 'var(--ink-soft)' }}>
          {mode === 'login' ? (
            <button onClick={() => { setMode('register'); setErr(''); }} className="underline">新增一个家人账号</button>
          ) : (
            anyUser && <button onClick={() => { setMode('login'); setErr(''); }} className="underline">已有账号，去登录</button>
          )}
        </div>
      </div>
    </div>
  );
}
