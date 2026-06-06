'use client';
import React from 'react';

export function Button({
  children, onClick, variant = 'primary', disabled, className = '', type = 'button',
}: {
  children: React.ReactNode;
  onClick?: () => void;
  variant?: 'primary' | 'ghost' | 'soft' | 'danger';
  disabled?: boolean;
  className?: string;
  type?: 'button' | 'submit';
}) {
  const base = 'inline-flex items-center justify-center gap-1.5 rounded-full px-4 py-2 text-sm font-medium transition active:scale-[0.98] disabled:opacity-50';
  const styles: Record<string, React.CSSProperties> = {
    primary: { background: 'var(--accent)', color: '#fff' },
    soft: { background: 'var(--surface-2)', color: 'var(--ink)', border: '1px solid var(--line)' },
    ghost: { background: 'transparent', color: 'var(--ink-soft)' },
    danger: { background: 'transparent', color: 'var(--danger)', border: '1px solid var(--line)' },
  };
  return (
    <button type={type} onClick={onClick} disabled={disabled} className={`${base} ${className}`} style={styles[variant]}>
      {children}
    </button>
  );
}

export function Spinner({ label }: { label?: string }) {
  return (
    <span className="inline-flex items-center gap-2 text-sm" style={{ color: 'var(--ink-soft)' }}>
      <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
      {label}
    </span>
  );
}

export function SectionTitle({ children, sub }: { children: React.ReactNode; sub?: string }) {
  return (
    <div className="mb-3">
      <h2 className="text-lg font-semibold" style={{ color: 'var(--ink)' }}>{children}</h2>
      {sub && <p className="text-sm" style={{ color: 'var(--ink-soft)' }}>{sub}</p>}
    </div>
  );
}

export function Toast({ msg }: { msg: string | null }) {
  if (!msg) return null;
  return (
    <div className="fixed bottom-24 left-1/2 z-50 -translate-x-1/2 rounded-full px-4 py-2 text-sm text-white shadow-lg"
      style={{ background: 'var(--ink)' }}>
      {msg}
    </div>
  );
}
