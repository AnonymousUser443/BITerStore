import { MobileApp } from '../components/mobile-app';

export default async function AppRoute({ params }: { params: Promise<{ path?: string[] }> }) {
  const { path = [] } = await params;
  return <MobileApp initialPath={`/${path.join('/')}`} />;
}
