'use client';

import dynamic from 'next/dynamic';

const MobileApp = dynamic(
  () => import('./mobile-app').then((module) => module.MobileApp),
  { ssr: false },
);

export function ClientMobileApp({ initialPath }: { initialPath: string }) {
  return <MobileApp initialPath={initialPath} />;
}
