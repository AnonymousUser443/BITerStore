import { feedbackAdapter, navigationAdapter } from '@/platform'
import { sessionStore } from './api'

export async function requireAccount(message = '登录后才能使用此功能') {
  if (__BITERSTORE_E2E__) return true
  const session = await sessionStore.get()
  if (session?.user.campusStatus === 'VERIFIED') return true
  if (session) await sessionStore.clear()
  await feedbackAdapter.toast(message)
  // The current page may contain private cached data. Reset the navigation
  // stack after clearing the session so Back cannot reveal it again.
  await navigationAdapter.switchTab('/pages/login/index')
  return false
}

export async function isAuthenticated() {
  if (__BITERSTORE_E2E__) return true
  return (await sessionStore.get())?.user.campusStatus === 'VERIFIED'
}

export async function getAuthenticatedUserId() {
  if (__BITERSTORE_E2E__) return undefined
  const session = await sessionStore.get()
  return session?.user.campusStatus === 'VERIFIED' ? session.user.id : undefined
}
