import type { Metadata, Viewport } from 'next';
import './globals.css';
import BottomNav from '@/components/BottomNav';

export const metadata: Metadata = {
  title: '家味·一周菜单',
  description: '记录每天三餐、明日预处理提醒、AI 健康菜谱推荐',
  manifest: '/manifest.json',
  appleWebApp: { capable: true, statusBarStyle: 'default', title: '家味' },
};

export const viewport: Viewport = {
  themeColor: '#f5f1ea',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>
        <main className="mx-auto w-full max-w-2xl px-4 pb-28 pt-4 min-h-screen">
          {children}
        </main>
        <BottomNav />
      </body>
    </html>
  );
}
