import { ClientMobileApp } from '../components/client-mobile-app';

export default async function AppRoute({ params }: { params: Promise<{ path?: string[] }> }) {
  const { path = [] } = await params;
  return <ClientMobileApp initialPath={`/${path.join('/')}`} />;
}
