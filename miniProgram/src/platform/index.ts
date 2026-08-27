import Taro from '@tarojs/taro'
import type { StoredMedia } from '@/domain/types'
import { AppError } from '@/domain/types'
import type { BitLoginChallenge } from '@/domain/bit-login'

export const STORAGE_NAMESPACE = 'biterstore:taro:v1'
const keyOf = (key: string) => `${STORAGE_NAMESPACE}:${key}`
function isMissingStorageValue(cause: unknown) {
  if (typeof cause === 'string') return /not found|data not found/i.test(cause)
  if (cause && typeof cause === 'object') {
    const message = 'errMsg' in cause ? String(cause.errMsg) : 'message' in cause ? String(cause.message) : ''
    return /not found|data not found/i.test(message)
  }
  return false
}
export interface StorageAdapter { get<T>(key: string, fallback: T): Promise<T>; set<T>(key: string, value: T): Promise<void>; remove(key: string): Promise<void>; clearNamespace(): Promise<void> }
export const storageAdapter: StorageAdapter = {
  async get(key, fallback) { try { const value = await Taro.getStorage({ key: keyOf(key) }); return (value.data ?? fallback) as typeof fallback } catch (cause) { if (isMissingStorageValue(cause)) return fallback; throw new AppError('STORAGE_READ', `读取 ${key} 失败`, cause) } },
  async set(key, value) { try { await Taro.setStorage({ key: keyOf(key), data: value }) } catch (cause) { throw new AppError('STORAGE_WRITE', `保存 ${key} 失败`, cause) } },
  async remove(key) { try { await Taro.removeStorage({ key: keyOf(key) }) } catch { /* removing a missing key is idempotent */ } },
  async clearNamespace() { const info = await Taro.getStorageInfo() as unknown as { keys: string[] }; await Promise.all(info.keys.filter((key) => key.startsWith(`${STORAGE_NAMESPACE}:`)).map((key) => Taro.removeStorage({ key }))) }
}

export interface NavigationAdapter { go(url: string): Promise<void>; switchTab(url: string): Promise<void>; back(): Promise<void>; currentRoute(): string }
export const navigationAdapter: NavigationAdapter = {
  async go(url) { await Taro.navigateTo({ url }) }, async switchTab(url) { await Taro.switchTab({ url }) },
  async back() { await Taro.navigateBack() }, currentRoute() { return Taro.getCurrentInstance().router?.path || '' }
}
export interface FeedbackAdapter { toast(message: string): Promise<void>; confirm(title: string, content: string): Promise<boolean> }
export const feedbackAdapter: FeedbackAdapter = {
  async toast(title) { await Taro.showToast({ title, icon: 'none' }) },
  async confirm(title, content) { const result = await Taro.showModal({ title, content }); return result.confirm }
}
export interface ShareAdapter { shareListing(id: string, title: string): Promise<void> }
export const shareAdapter: ShareAdapter = { async shareListing(id, title) { await Taro.setClipboardData({ data: `${title} · BITerStore /books/${id}` }); await feedbackAdapter.toast('分享链接已复制') } }

function bitLoginMessage(data: unknown) {
  if (data && typeof data === 'object' && 'detail' in data) {
    const detail = data.detail
    if (typeof detail === 'string') return detail
    if (detail && typeof detail === 'object' && 'message' in detail && typeof detail.message === 'string') return detail.message
  }
  return '统一身份认证失败，请稍后重试'
}
async function bitLoginRequest(path: string, method: 'GET' | 'POST', data?: object, token?: string): Promise<BitLoginChallenge> {
  const response = await Taro.request({ url: `${__BIT_LOGIN_URL__}${path}`, method, data, header: { 'Content-Type': 'application/json', ...(token ? { 'X-Challenge-Token': token } : {}) } })
  if (response.statusCode < 200 || response.statusCode >= 300) throw new AppError('BIT_LOGIN', bitLoginMessage(response.data), response.data)
  return response.data as BitLoginChallenge
}
export const bitLoginTransport = {
  start(username: string, password: string) { return bitLoginRequest('/api/auth/start', 'POST', { username, password, services: ['jwb'], wait_seconds: 1 }) },
  status(challengeId: string, token: string) { return bitLoginRequest(`/api/auth/${challengeId}`, 'GET', undefined, token) },
  sms(challengeId: string, token: string, code: string) { return bitLoginRequest(`/api/auth/${challengeId}/sms`, 'POST', { code }, token) }
}

const MEDIA_KEY = 'media'
const MEDIA_DB = 'biterstore-taro-media-v1'
function openMediaDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = globalThis.indexedDB.open(MEDIA_DB, 1)
    request.onupgradeneeded = () => request.result.createObjectStore('files', { keyPath: 'id' })
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}
async function putH5Media(item: StoredMedia): Promise<StoredMedia> {
  const blob = await fetch(item.uri).then((response) => response.blob())
  const db = await openMediaDb()
  await new Promise<void>((resolve, reject) => { const tx = db.transaction('files', 'readwrite'); tx.objectStore('files').put({ id: item.id, blob, mime: blob.type || item.mime, size: blob.size }); tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error) })
  db.close()
  return { ...item, uri: `idb:${item.id}`, mime: blob.type || item.mime, size: blob.size }
}
async function removeH5Media(ids: string[]) {
  const db = await openMediaDb()
  await new Promise<void>((resolve, reject) => { const tx = db.transaction('files', 'readwrite'); ids.forEach((id) => tx.objectStore('files').delete(id)); tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error) })
  db.close()
}
async function listH5Media(items: StoredMedia[]): Promise<StoredMedia[]> {
  const db = await openMediaDb()
  const resolved = await Promise.all(items.map((item) => new Promise<StoredMedia>((resolve) => { if (!item.uri.startsWith('idb:')) return resolve(item); const request = db.transaction('files').objectStore('files').get(item.id); request.onsuccess = () => resolve(request.result?.blob ? { ...item, uri: globalThis.URL.createObjectURL(request.result.blob) } : item); request.onerror = () => resolve(item) })))
  db.close(); return resolved
}
export interface MediaAdapter { pick(): Promise<StoredMedia[]>; persist(items: StoredMedia[]): Promise<StoredMedia[]>; remove(ids: string[]): Promise<void>; list(): Promise<StoredMedia[]> }
export const mediaAdapter: MediaAdapter = {
  async pick() {
    if (__BITERSTORE_E2E__) return [{ id: 'fixture-book', uri: '/assets/tobby-guide-publish.webp', mime: 'image/webp', size: 1024 }]
    try {
      const result = await Taro.chooseMedia({ count: 6, mediaType: ['image'], sourceType: ['album', 'camera'] })
      return result.tempFiles.map((file, index) => ({ id: `media-${Date.now()}-${index}`, uri: file.tempFilePath, mime: 'image/jpeg', size: file.size || 0 }))
    } catch (cause) { throw new AppError('MEDIA_PICK', '选择图片失败', cause) }
  },
  async persist(items) {
    try {
      const persisted: StoredMedia[] = []
      for (const item of items) {
        if (process.env.TARO_ENV === 'h5' && !item.uri.startsWith('/assets/')) persisted.push(await putH5Media(item))
        else if (process.env.TARO_ENV === 'weapp' && !item.uri.startsWith('/assets/')) {
          const saved = await Taro.saveFile({ tempFilePath: item.uri }) as { savedFilePath: string }; persisted.push({ ...item, uri: saved.savedFilePath })
        } else persisted.push(item)
      }
      const existing = await storageAdapter.get<StoredMedia[]>(MEDIA_KEY, [])
      await storageAdapter.set(MEDIA_KEY, [...existing.filter((x) => !persisted.some((p) => p.id === x.id)), ...persisted])
      return persisted
    } catch (cause) { throw new AppError('MEDIA_PERSIST', '保存图片失败', cause) }
  },
  async remove(ids) {
    const existing = await storageAdapter.get<StoredMedia[]>(MEDIA_KEY, [])
    if (process.env.TARO_ENV === 'h5' && typeof globalThis.indexedDB !== 'undefined') await removeH5Media(ids)
    if (process.env.TARO_ENV === 'weapp') await Promise.all(existing.filter((item) => ids.includes(item.id) && !item.uri.startsWith('/assets/')).map((item) => Taro.removeSavedFile({ filePath: item.uri }).catch(() => undefined)))
    await storageAdapter.set(MEDIA_KEY, existing.filter((item) => !ids.includes(item.id)))
  },
  async list() { const items = await storageAdapter.get<StoredMedia[]>(MEDIA_KEY, []); return process.env.TARO_ENV === 'h5' && typeof globalThis.indexedDB !== 'undefined' ? listH5Media(items) : items }
}

export interface CacheAdapter { prepare(version: string): Promise<boolean> }
export const cacheAdapter: CacheAdapter = { async prepare(version) { const current = await storageAdapter.get('asset-version', ''); if (current === version) return false; await storageAdapter.set('asset-version', version); return true } }
export const ASSET_VERSION = '2026.08.27.1'
const criticalAssets = [
  '/assets/paper-bg.webp',
  '/assets/tobby-master-transparent.webp',
  '/assets/tobby-hello.webp',
  '/assets/tobby-search.webp',
  '/assets/tobby-guide-publish.webp'
] as const

export function isAssetBundleReady() {
  try { return Taro.getStorageSync(keyOf('asset-version')) === ASSET_VERSION } catch { return false }
}

export async function prepareAssetBundle(onProgress?: (progress: number) => void) {
  if (isAssetBundleReady()) { onProgress?.(100); return false }
  onProgress?.(6)
  for (let index = 0; index < criticalAssets.length; index += 1) {
    await Taro.getImageInfo({ src: criticalAssets[index] }).catch(() => undefined)
    onProgress?.(Math.round(12 + ((index + 1) / criticalAssets.length) * 80))
  }
  await storageAdapter.set('asset-version', ASSET_VERSION)
  onProgress?.(100)
  return true
}
