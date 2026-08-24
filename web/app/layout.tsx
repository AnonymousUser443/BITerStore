import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'BITerStore · 北理校园二手书',
  description: '把闲置托付给托比，让每一本书继续被需要。',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
