'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const items = [
  { href: '/', label: '本周', icon: '🗓️' },
  { href: '/today', label: '今明', icon: '🔔' },
  { href: '/discover', label: '想吃啥', icon: '✨' },
  { href: '/settings', label: '设置', icon: '⚙️' },
];

export default function BottomNav() {
  const path = usePathname();
  return (
    <nav
      className="fixed bottom-0 left-1/2 z-40 w-full max-w-2xl -translate-x-1/2 border-t px-2 pb-[env(safe-area-inset-bottom)]"
      style={{ background: 'var(--surface)', borderColor: 'var(--line)' }}
    >
      <div className="flex items-stretch justify-around">
        {items.map((it) => {
          const active = it.href === '/' ? path === '/' : path.startsWith(it.href);
          return (
            <Link
              key={it.href}
              href={it.href}
              className="flex flex-1 flex-col items-center gap-0.5 py-2 text-xs"
              style={{ color: active ? 'var(--accent)' : 'var(--ink-soft)' }}
            >
              <span className="text-lg leading-none">{it.icon}</span>
              <span style={{ fontWeight: active ? 600 : 400 }}>{it.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
