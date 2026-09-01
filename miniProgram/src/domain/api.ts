import Taro from '@tarojs/taro'
import { STORAGE_NAMESPACE, storageAdapter } from '@/platform'

type RequestOptions = { method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE'; data?: unknown }
const SESSION_KEY = 'api-session'
const GUEST_KEY = 'guest-mode'
const REFRESH_EARLY_MS = 30_000
export interface ApiSession { accessToken: string; refreshToken: string; expiresIn: number; expiresAt?: number; user: { id: string; role: string; campusStatus: string } }
let sessionCache: ApiSession | null | undefined
let refreshInFlight: { token: string; promise: Promise<ApiSession> } | undefined

if (process.env.TARO_ENV === 'h5' && typeof globalThis.addEventListener === 'function') {
  globalThis.addEventListener('storage', (event) => {
    if (event.key === `${STORAGE_NAMESPACE}:${SESSION_KEY}`) sessionCache = undefined
  })
}

export function apiQuery(query: Record<string, unknown>) {
  const values = Object.entries(query).filter(([, value]) => value !== undefined && value !== '' && value !== '全部')
  return values.length ? `?${values.map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`).join('&')}` : ''
}

async function readSession() {
  if (sessionCache === undefined) sessionCache = await storageAdapter.get<ApiSession | null>(SESSION_KEY, null)
  return sessionCache
}

async function sendRequest<T>(path: string, options: RequestOptions, session: ApiSession | null) {
  const method = options.method || 'GET'
  const data = options.data === undefined && method !== 'GET' ? {} : options.data
  return Taro.request<T | { message?: string }>({
    url: `${__API_URL__}${path}`, method, data,
    header: { 'Content-Type': 'application/json', ...(session?.accessToken ? { Authorization: `Bearer ${session.accessToken}` } : {}) }
  })
}

async function refreshSession(session: ApiSession): Promise<ApiSession> {
  const current = await readSession()
  if (current?.refreshToken && current.refreshToken !== session.refreshToken) return current
  if (refreshInFlight?.token === session.refreshToken) return refreshInFlight.promise
  const promise = sendRequest<ApiSession>('/auth/refresh', { method: 'POST', data: { refreshToken: session.refreshToken } }, session)
    .then(async (response) => {
      if (response.statusCode < 200 || response.statusCode >= 300) {
        const message = response.data && typeof response.data === 'object' && 'message' in response.data ? String(response.data.message) : `请求失败（${response.statusCode}）`
        throw new Error(message)
      }
      const refreshed = response.data as ApiSession
      if ((await readSession())?.refreshToken === session.refreshToken) await sessionStore.set(refreshed)
      return (await readSession()) || refreshed
    })
    .finally(() => { if (refreshInFlight?.promise === promise) refreshInFlight = undefined })
  refreshInFlight = { token: session.refreshToken, promise }
  return promise
}

export async function apiRequest<T>(path: string, options: RequestOptions = {}, retry = true): Promise<T> {
  let session = await readSession()
  if (retry && path !== '/auth/refresh' && session?.refreshToken && session.expiresAt && session.expiresAt <= Date.now() + REFRESH_EARLY_MS) {
    session = await refreshSession(session)
  }
  let response = await sendRequest<T>(path, options, session)
  if (response.statusCode === 401 && retry && session?.refreshToken) {
    session = await refreshSession(session)
    response = await sendRequest<T>(path, options, session)
  }
  if (response.statusCode < 200 || response.statusCode >= 300) {
    const message = response.data && typeof response.data === 'object' && 'message' in response.data ? String(response.data.message) : `请求失败（${response.statusCode}）`
    throw new Error(message)
  }
  return response.data as T
}

export type SessionMode = 'authenticated' | 'guest' | 'anonymous'

export const sessionStore = {
  peek() {
    if (sessionCache === undefined) sessionCache = storageAdapter.peek<ApiSession | null>(SESSION_KEY, null)
    return sessionCache
  },
  get: readSession,
  async set(session: ApiSession) {
    const persisted = { ...session, expiresAt: Date.now() + Math.max(1, session.expiresIn) * 1000 }
    await storageAdapter.set(SESSION_KEY, persisted)
    sessionCache = persisted
    await storageAdapter.remove(GUEST_KEY)
  },
  async enterGuest() {
    await storageAdapter.remove(SESSION_KEY)
    sessionCache = null
    await storageAdapter.set(GUEST_KEY, true)
  },
  async clear() {
    await storageAdapter.remove(SESSION_KEY)
    sessionCache = null
    await storageAdapter.remove(GUEST_KEY)
  },
  async mode(): Promise<SessionMode> {
    const session = await storageAdapter.get<ApiSession | null>(SESSION_KEY, null)
    if (session?.user.campusStatus === 'VERIFIED') return 'authenticated'
    return await storageAdapter.get(GUEST_KEY, false) ? 'guest' : 'anonymous'
  }
}
