import Taro from '@tarojs/taro'
import { routes } from '../navigation'

export interface SharePayload {
  type: 'book'
  id: string
  title: string
}

export interface ShareAdapter {
  build(payload: SharePayload): { title: string; path: string }
  copyH5Link(payload: SharePayload): Promise<void>
}

export const shareAdapter: ShareAdapter = {
  build(payload) {
    return { title: `${payload.title}｜BITerStore`, path: `${routes.bookDetail}?id=${encodeURIComponent(payload.id)}` }
  },
  async copyH5Link(payload) {
    const path = `/books/${encodeURIComponent(payload.id)}`
    await Taro.setClipboardData({ data: process.env.TARO_ENV === 'h5' ? `${globalThis.location?.origin ?? ''}${path}` : path })
  },
}
