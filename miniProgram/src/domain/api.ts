import Taro from '@tarojs/taro'
import { mediaAdapter, setMediaOwner, STORAGE_NAMESPACE, storageAdapter } from '@/platform'

type RequestOptions = { method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE'; data?: unknown }
const SESSION_KEY = 'api-session'
const GUEST_KEY = 'guest-mode'
const REFRESH_EARLY_MS = 30_000
export interface ApiSession { accessToken?: string; refreshToken?: string; expiresIn: number; expiresAt?: number; transport?: 'bearer' | 'cookie'; user: { id: string; role: string; campusStatus: string } }
let sessionCache: ApiSession | null | undefined
let refreshInFlight: { token: string; promise: Promise<ApiSession> } | undefined
let authExpiryNotified = false

if (process.env.TARO_ENV === 'h5' && typeof globalThis.addEventListener === 'function') {
  globalThis.addEventListener('storage', (event) => {
    if (event.key !== `${STORAGE_NAMESPACE}:${SESSION_KEY}`) return
    const previousUserId = sessionCache?.user.id
    sessionCache = undefined
    void storageAdapter.get<ApiSession | null>(SESSION_KEY, null).then((next) => {
      if (previousUserId !== next?.user.id) void mediaAdapter.clear().catch(() => undefined)
      setMediaOwner(next?.user.id)
    }).catch(() => setMediaOwner(undefined))
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
  const cookieSession = process.env.TARO_ENV === 'h5'
  return Taro.request<T | { message?: string }>({
    url: `${__API_URL__}${path}`, method, data,
    header: { 'Content-Type': 'application/json', ...(session?.accessToken ? { Authorization: `Bearer ${session.accessToken}` } : {}) },
    ...(cookieSession ? { credentials: 'include' as const } : {})
  })
}

async function refreshSession(session: ApiSession): Promise<ApiSession> {
  const current = await readSession()
  if (current?.user.id && current.user.id !== session.user.id) return current
  if (current?.refreshToken && current.refreshToken !== session.refreshToken) return current
  const refreshKey = `${session.user.id}:${session.refreshToken || 'cookie'}`
  if (refreshInFlight?.token === refreshKey) return refreshInFlight.promise
  const cookieSession = process.env.TARO_ENV === 'h5' && !session.refreshToken
  const promise = sendRequest<ApiSession>('/auth/refresh', { method: 'POST', data: cookieSession ? {} : { refreshToken: session.refreshToken } }, session)
    .then(async (response) => {
      if (response.statusCode < 200 || response.statusCode >= 300) {
        const message = response.data && typeof response.data === 'object' && 'message' in response.data ? String(response.data.message) : `请求失败（${response.statusCode}）`
        throw new Error(message)
      }
      const refreshed = { ...session, ...(response.data as Partial<ApiSession>), transport: cookieSession ? 'cookie' as const : 'bearer' as const }
      const currentSession = await readSession()
      const sameSession = currentSession?.user.id === session.user.id && (cookieSession || currentSession?.refreshToken === session.refreshToken)
      if (!sameSession) {
        if (currentSession) return currentSession
        throw new Error('会话已切换或退出')
      }
      if (refreshed.user?.id !== session.user.id) throw new Error('刷新响应账号不一致')
      await sessionStore.set(refreshed)
      return (await readSession()) || refreshed
    })
    .finally(() => { if (refreshInFlight?.promise === promise) refreshInFlight = undefined })
  refreshInFlight = { token: refreshKey, promise }
  return promise
}

async function clearExpiredSession() {
  await sessionStore.clear()
  if (authExpiryNotified) return
  authExpiryNotified = true
  if (typeof globalThis.dispatchEvent === 'function' && typeof globalThis.CustomEvent === 'function') {
    globalThis.dispatchEvent(new CustomEvent('biterstore:auth-expired'))
  }
  const eventCenter = (Taro as unknown as { eventCenter?: { trigger?: (event: string) => void } }).eventCenter
  eventCenter?.trigger?.('biterstore:auth-expired')
}

function canRefresh(session: ApiSession | null): session is ApiSession {
  return Boolean(session && (session.refreshToken || process.env.TARO_ENV === 'h5'))
}

export async function apiRequest<T>(path: string, options: RequestOptions = {}, retry = true): Promise<T> {
  let session = await readSession()
  if (retry && path !== '/auth/refresh' && canRefresh(session) && session.expiresAt && session.expiresAt <= Date.now() + REFRESH_EARLY_MS) {
    try { session = await refreshSession(session) } catch (error) { await clearExpiredSession(); throw error }
  }
  let response = await sendRequest<T>(path, options, session)
  if (response.statusCode === 401 && retry && canRefresh(session)) {
    try {
      session = await refreshSession(session)
      response = await sendRequest<T>(path, options, session)
    } catch (error) {
      await clearExpiredSession()
      throw error
    }
  }
  if (response.statusCode === 401 && session) await clearExpiredSession()
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
    const previous = await readSession()
    if (previous?.user.id && previous.user.id !== session.user.id) await this.clear()
    setMediaOwner(session.user.id)
    // H5 authentication is cookie-based. Strip tokens even if a proxy or an
    // older server accidentally includes them in the response, so a future
    // XSS cannot recover a bearer/refresh credential from Taro storage.
    const browserSession = process.env.TARO_ENV === 'h5'
      ? (({ accessToken: _accessToken, refreshToken: _refreshToken, ...safe }) => safe)(session)
      : session
    const persisted: ApiSession = {
      ...browserSession,
      transport: process.env.TARO_ENV === 'h5' ? 'cookie' : (session.transport || 'bearer'),
      expiresAt: Date.now() + Math.max(1, Number(session.expiresIn) || 900) * 1000
    }
    await storageAdapter.set(SESSION_KEY, persisted)
    sessionCache = persisted
    authExpiryNotified = false
    await storageAdapter.remove(GUEST_KEY)
  },
  async enterGuest() {
    await this.clear()
    await storageAdapter.set(GUEST_KEY, true)
  },
  async clear() {
    const previous = await readSession().catch(() => null)
    await mediaAdapter.clear().catch(() => undefined)
    await storageAdapter.clearAccountNamespace(previous?.user.id).catch(() => undefined)
    await storageAdapter.remove(SESSION_KEY).catch(() => undefined)
    await storageAdapter.remove(GUEST_KEY).catch(() => undefined)
    sessionCache = null
    setMediaOwner(undefined)
  },
  async mode(): Promise<SessionMode> {
    const session = await storageAdapter.get<ApiSession | null>(SESSION_KEY, null)
    if (session?.user.campusStatus === 'VERIFIED') return 'authenticated'
    return await storageAdapter.get(GUEST_KEY, false) ? 'guest' : 'anonymous'
  }
}
