declare const __API_URL__: string;

const apiBase = (typeof __API_URL__ === 'string' && __API_URL__ ? __API_URL__ : '/api/v1').replace(/\/$/, '');

export interface H5SessionUser {
  id: string;
  role: string;
  campusStatus: string;
}

export interface H5Profile extends H5SessionUser {
  nickname: string;
  avatarUrl: string | null;
  campus: string | null;
  bio: string;
  status: string;
  createdAt: string;
  wechatBound: boolean;
}

type H5Session = { expiresIn: number; user: H5SessionUser };

function messageOf(body: unknown, fallback: string) {
  if (body && typeof body === 'object' && 'message' in body) {
    const message = body.message;
    if (Array.isArray(message)) return message.join('；');
    if (typeof message === 'string') return message;
  }
  return fallback;
}

async function rawRequest<T>(path: string, init: RequestInit = {}): Promise<{ response: Response; body: T | Record<string, unknown> }> {
  const response = await fetch(`${apiBase}${path}`, {
    ...init,
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...init.headers },
  });
  const body = await response.json().catch(() => ({})) as T | Record<string, unknown>;
  return { response, body };
}

async function request<T>(path: string, init: RequestInit = {}, retry = true): Promise<T> {
  let result = await rawRequest<T>(path, init);
  if (result.response.status === 401 && retry && path !== '/auth/refresh') {
    const refreshed = await rawRequest<H5Session>('/auth/refresh', {
      method: 'POST', body: JSON.stringify({ sessionTransport: 'cookie' })
    });
    if (refreshed.response.ok) result = await rawRequest<T>(path, init);
  }
  if (!result.response.ok) throw new Error(messageOf(result.body, `请求失败（${result.response.status}）`));
  return result.body as T;
}

export async function loginWithCampusCookie(registrationToken: string): Promise<H5Session> {
  return request<H5Session>('/auth/campus', {
    method: 'POST',
    body: JSON.stringify({ registrationToken, platform: 'h5', sessionTransport: 'cookie' }),
  }, false);
}

export function getH5Profile(): Promise<H5Profile> {
  return request<H5Profile>('/me');
}

export function updateH5Profile(profile: { nickname: string; avatarUrl: string | null; campus: string | null; bio: string }): Promise<H5Profile> {
  return request<H5Profile>('/me', { method: 'PATCH', body: JSON.stringify(profile) });
}

export async function restoreH5Session(): Promise<H5Profile | null> {
  try {
    return await getH5Profile();
  } catch {
    return null;
  }
}

export async function logoutH5Session(): Promise<void> {
  const result = await rawRequest<{ ok: boolean }>('/auth/logout', { method: 'POST', body: '{}' });
  if (!result.response.ok) throw new Error(messageOf(result.body, '退出登录失败'));
}
