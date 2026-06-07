'use client';
import { AuthProvider, useAuth } from './AuthProvider';
import AuthGate from './AuthGate';
import BottomNav from './BottomNav';

function Inner({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  return (
    <AuthGate>
      <main className="mx-auto w-full max-w-2xl px-4 pb-28 pt-4 min-h-screen">
        {children}
      </main>
      {user && <BottomNav />}
    </AuthGate>
  );
}

export default function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <Inner>{children}</Inner>
    </AuthProvider>
  );
}
