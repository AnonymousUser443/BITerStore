import Taro from '@tarojs/taro'
import { storageAdapter } from '@/platform'

type RequestOptions = { method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE'; data?: unknown }
const SESSION_KEY = 'api-session'
const GUEST_KEY = 'guest-mode'
export interface ApiSession { accessToken: string; refreshToken: string; expiresIn: number; user: { id: string; role: string; campusStatus: string } }

export function apiQuery(query: Record<string, unknown>) {
  const values = Object.entries(query).filter(([, value]) => value !== undefined && value !== '' && value !== '全部')
  return values.length ? `?${values.map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`).join('&')}` : ''
}

export async function apiRequest<T>(path: string, options: RequestOptions = {}, retry = true): Promise<T> {
  const session = await storageAdapter.get<ApiSession | null>(SESSION_KEY, null)
  const method = options.method || 'GET'
  const data = options.data === undefined && method !== 'GET' ? {} : options.data
  const response = await Taro.request<T | { message?: string }>({
    url: `${__API_URL__}${path}`, method, data,
    header: { 'Content-Type': 'application/json', ...(session?.accessToken ? { Authorization: `Bearer ${session.accessToken}` } : {}) }
  })
  if (response.statusCode === 401 && retry && session?.refreshToken) {
    const refreshed = await apiRequest<ApiSession>('/auth/refresh', { method: 'POST', data: { refreshToken: session.refreshToken } }, false)
    await storageAdapter.set(SESSION_KEY, refreshed)
    return apiRequest<T>(path, options, false)
  }
  if (response.statusCode < 200 || response.statusCode >= 300) {
    const message = response.data && typeof response.data === 'object' && 'message' in response.data ? String(response.data.message) : `请求失败（${response.statusCode}）`
    throw new Error(message)
  }
  return response.data as T
}

export type SessionMode = 'authenticated' | 'guest' | 'anonymous'

export const sessionStore = {
  get: () => storageAdapter.get<ApiSession | null>(SESSION_KEY, null),
  async set(session: ApiSession) {
    await storageAdapter.set(SESSION_KEY, session)
    await storageAdapter.remove(GUEST_KEY)
  },
  async enterGuest() {
    await storageAdapter.remove(SESSION_KEY)
    await storageAdapter.set(GUEST_KEY, true)
  },
  async clear() {
    await storageAdapter.remove(SESSION_KEY)
    await storageAdapter.remove(GUEST_KEY)
  },
  async mode(): Promise<SessionMode> {
    const session = await storageAdapter.get<ApiSession | null>(SESSION_KEY, null)
    if (session?.user.campusStatus === 'VERIFIED') return 'authenticated'
    return await storageAdapter.get(GUEST_KEY, false) ? 'guest' : 'anonymous'
  }
}
