const ROUTE_ID = /^[A-Za-z0-9_-]{1,100}$/u;

export const notificationRouteTypes = ['like', 'comment', 'system', 'follow'] as const;
export const stateRouteTypes = ['loading', 'searching', 'empty', 'no-results', 'network', 'maintenance', 'unavailable', 'published', '404'] as const;

const notificationTypes = new Set<string>(notificationRouteTypes);
const stateTypes = new Set<string>(stateRouteTypes);

function normalizedPathname(pathname: string) {
  if (pathname.length > 1 && pathname.endsWith('/')) return pathname.slice(0, -1);
  return pathname || '/';
}

function validId(value: string | null) {
  return value && ROUTE_ID.test(value) ? value : null;
}

export function exactRouteParam(path: string, prefix: string) {
  if (!path.startsWith(prefix)) return null;
  const value = path.slice(prefix.length);
  return validId(value);
}

export function appPathFromUrl(input: string | URL) {
  const url = input instanceof URL ? input : new URL(input, 'https://biterstore.invalid');
  const path = normalizedPathname(url.pathname);

  if (path === '/welcome') return '/';
  if (path === '/search') return '/category';
  if (path === '/books') {
    const id = validId(url.searchParams.get('id'));
    return id ? `/books/${id}` : '/states/404';
  }
  if (path === '/chat') {
    const id = validId(url.searchParams.get('id'));
    return id ? `/messages/${id}` : '/states/404';
  }
  if (path === '/notifications') {
    const type = url.searchParams.get('type') || '';
    return notificationTypes.has(type) ? `/messages/notifications/${type}` : '/states/404';
  }
  if (path === '/states') {
    const rawType = url.searchParams.get('type');
    if (!rawType || rawType === 'index') return '/states';
    const type = rawType === 'not-found' ? '404' : rawType;
    return stateTypes.has(type) ? `/states/${type}` : '/states/404';
  }

  const bookId = exactRouteParam(path, '/books/');
  if (bookId) return `/books/${bookId}`;
  if (path.startsWith('/books/')) return '/states/404';

  if (path.startsWith('/messages/notifications/')) {
    const type = path.slice('/messages/notifications/'.length);
    return notificationTypes.has(type) ? `/messages/notifications/${type}` : '/states/404';
  }
  const threadId = exactRouteParam(path, '/messages/');
  if (threadId) return `/messages/${threadId}`;
  if (path.startsWith('/messages/')) return '/states/404';

  if (path.startsWith('/states/')) {
    const rawType = path.slice('/states/'.length);
    const type = rawType === 'not-found' ? '404' : rawType;
    return stateTypes.has(type) ? `/states/${type}` : '/states/404';
  }

  return path;
}

export function browserPathForAppPath(appPath: string) {
  const normalized = appPathFromUrl(new URL(appPath, 'https://biterstore.invalid'));
  const bookId = exactRouteParam(normalized, '/books/');
  if (bookId) return `/books?id=${encodeURIComponent(bookId)}`;

  if (normalized.startsWith('/messages/notifications/')) {
    const type = normalized.slice('/messages/notifications/'.length);
    if (notificationTypes.has(type)) return `/notifications?type=${encodeURIComponent(type)}`;
  }
  const threadId = exactRouteParam(normalized, '/messages/');
  if (threadId) return `/chat?id=${encodeURIComponent(threadId)}`;

  if (normalized.startsWith('/states/')) {
    const type = normalized.slice('/states/'.length);
    if (stateTypes.has(type)) return `/states?type=${encodeURIComponent(type)}`;
  }
  return normalized;
}
