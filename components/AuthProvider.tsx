'use client';
import { createContext, useContext, useEffect, useState } from 'react';
import type { User } from '@/lib/types';

interface AuthCtx {
  user: User | null;
  ready: boolean;
  signIn: (u: User, remember: boolean) => void;
  signOut: () => void;
}

const Ctx = createContext<AuthCtx>({ user: null, ready: false, signIn: () => {}, signOut: () => {} });

const KEY = 'jiawei_auth';

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      // 优先 localStorage（记住登录），否则 sessionStorage（仅本次会话）
      const raw = localStorage.getItem(KEY) || sessionStorage.getItem(KEY);
      if (raw) setUser(JSON.parse(raw));
    } catch {}
    setReady(true);
  }, []);

  function signIn(u: User, remember: boolean) {
    setUser(u);
    const raw = JSON.stringify(u);
    if (remember) {
      localStorage.setItem(KEY, raw);
      sessionStorage.removeItem(KEY);
    } else {
      sessionStorage.setItem(KEY, raw);
      localStorage.removeItem(KEY);
    }
  }

  function signOut() {
    setUser(null);
    localStorage.removeItem(KEY);
    sessionStorage.removeItem(KEY);
  }

  return <Ctx.Provider value={{ user, ready, signIn, signOut }}>{children}</Ctx.Provider>;
}

export function useAuth() {
  return useContext(Ctx);
}
