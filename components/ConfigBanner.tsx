'use client';
import { supabaseReady } from '@/lib/supabase';
import Link from 'next/link';

export default function ConfigBanner() {
  if (supabaseReady) return null;
  return (
    <div className="card mb-4 p-4" style={{ borderColor: 'var(--warn)' }}>
      <p className="text-sm font-medium" style={{ color: 'var(--warn)' }}>还没连接数据库</p>
      <p className="mt-1 text-sm" style={{ color: 'var(--ink-soft)' }}>
        请在项目根目录创建 <code>.env.local</code> 并填入 Supabase 的 URL 和 anon key（参考 <code>.env.local.example</code>），然后重启。
        详细步骤见 <Link href="/settings" className="underline">设置</Link> 页。
      </p>
    </div>
  );
}
