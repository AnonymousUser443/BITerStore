export const API_ROOT = (import.meta.env.VITE_API_URL || '/api/v1').replace(/\/$/, '')
export const ADMIN_TOKEN_KEY = 'biterstore-admin-token'

export class ApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message)
  }
}

export async function apiRequest<T>(path: string, init: RequestInit = {}, tokenOverride?: string | null, allowRefresh = true): Promise<T> {
  const token = tokenOverride === undefined ? sessionStorage.getItem(ADMIN_TOKEN_KEY) : tokenOverride
  let response = await fetch(`${API_ROOT}${path}`, {
    ...init,
    credentials: 'same-origin',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init.headers
    }
  })
  if (response.status === 401 && token && allowRefresh && path !== '/admin/security/refresh') {
    const refreshed = await fetch(`${API_ROOT}/admin/security/refresh`, {
      method: 'POST', body: '{}', credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }
    })
    if (refreshed.ok) {
      const session = await refreshed.json() as { accessToken?: string }
      if (session.accessToken) {
        sessionStorage.setItem(ADMIN_TOKEN_KEY, session.accessToken)
        return apiRequest<T>(path, init, session.accessToken, false)
      }
    }
  }
  if (!response.ok) {
    const payload = await response.json().catch(() => null) as { message?: string | string[] } | null
    const message = Array.isArray(payload?.message) ? payload.message.join('；') : payload?.message
    throw new ApiError(message || `请求失败（${response.status}）`, response.status)
  }
  if (response.status === 204) return undefined as T
  return response.json() as Promise<T>
}

export async function apiBlob(path: string): Promise<Blob> {
  const token = sessionStorage.getItem(ADMIN_TOKEN_KEY)
  const response = await fetch(`${API_ROOT}${path}`, {
    credentials: 'same-origin',
    headers: token ? { Authorization: `Bearer ${token}` } : {}
  })
  if (!response.ok) {
    const payload = await response.json().catch(() => null) as { message?: string | string[] } | null
    const message = Array.isArray(payload?.message) ? payload.message.join('；') : payload?.message
    throw new ApiError(message || `图片加载失败（${response.status}）`, response.status)
  }
  return response.blob()
}

export async function refreshBrowserSession() {
  return apiRequest('/auth/refresh', {
    method: 'POST',
    body: '{}'
  }, null)
}

export function queryString(values: Record<string, string | number | undefined>) {
  const query = new URLSearchParams()
  Object.entries(values).forEach(([key, value]) => {
    if (value !== undefined && value !== '') query.set(key, String(value))
  })
  const result = query.toString()
  return result ? `?${result}` : ''
}

export function requestId() {
  return typeof crypto.randomUUID === 'function'
    ? `admin-${crypto.randomUUID()}`
    : `admin-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}
