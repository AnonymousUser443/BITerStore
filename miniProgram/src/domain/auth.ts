import Taro from '@tarojs/taro'
import { apiRequest, sessionStore, type ApiSession } from './api'

export async function loginWithCampus(registrationToken: string): Promise<ApiSession> {
  const session = await apiRequest<ApiSession>('/auth/campus', {
    method: 'POST',
    data: { registrationToken, platform: process.env.TARO_ENV === 'weapp' ? 'weapp' : 'h5' }
  })
  await sessionStore.set(session)
  return session
}

export async function loginWithWechat(): Promise<ApiSession | { authorizeUrl: string; state: string }> {
  if (process.env.TARO_ENV === 'weapp') {
    const result = await Taro.login()
    const session = await apiRequest<ApiSession>('/auth/wechat/mini-program', { method: 'POST', data: { code: result.code, device: 'weapp' } })
    await sessionStore.set(session)
    return session
  }
  const login = await apiRequest<{ authorizeUrl: string; state: string }>('/auth/wechat/web/start', { method: 'POST' })
  await Taro.setStorage({ key: 'biterstore:web-login-state', data: login.state })
  return login
}

export async function bindWechat(): Promise<{ bound: boolean }> {
  if (process.env.TARO_ENV !== 'weapp') throw new Error('请在微信小程序中绑定微信')
  const result = await Taro.login()
  return apiRequest<{ bound: boolean }>('/auth/wechat/mini-program/bind', {
    method: 'POST',
    data: { code: result.code }
  })
}

export async function continueAsGuest() { await sessionStore.enterGuest() }

export async function pollWebLogin(state: string): Promise<ApiSession> {
  const deadline = Date.now() + 300_000
  while (Date.now() < deadline) {
    const result = await apiRequest<{ status: string } & Partial<ApiSession>>(`/auth/wechat/web/status?state=${encodeURIComponent(state)}`)
    if (result.status === 'AUTHENTICATED' && result.accessToken && result.refreshToken && result.user) { const session = result as ApiSession; await sessionStore.set(session); return session }
    await new Promise((resolve) => setTimeout(resolve, 1500))
  }
  throw new Error('微信登录已超时，请重试')
}

export async function logout() { const session = await sessionStore.get(); await apiRequest('/auth/logout', { method: 'POST', data: { refreshToken: session?.refreshToken } }).catch(() => undefined); await sessionStore.clear() }
export async function exchangeCampusToken(registrationToken: string) {
  const result = await apiRequest<{ status: string; verifiedAt: string }>('/identity/campus/exchange', { method: 'POST', data: { registrationToken } })
  const current = await sessionStore.get()
  if (current?.refreshToken) { const refreshed = await apiRequest<ApiSession>('/auth/refresh', { method: 'POST', data: { refreshToken: current.refreshToken } }, false); await sessionStore.set(refreshed) }
  return result
}
