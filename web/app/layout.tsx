import type { Metadata } from 'next';
import './globals.css';

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: 'BITerStore · 北理校园二手书',
  description: '把闲置托付给托比，让每一本书继续被需要。',
  openGraph: {
    title: 'BITerStore · 北理校园二手书',
    description: '让每一本书继续被需要。',
    type: 'website',
    locale: 'zh_CN',
    images: [{ url: '/og.png', width: 1200, height: 630, alt: 'BITerStore 北理校园二手书小站' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'BITerStore · 北理校园二手书',
    description: '让每一本书继续被需要。',
    images: ['/og.png'],
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
