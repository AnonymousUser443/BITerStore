import Taro from '@tarojs/taro'
import { storageAdapter } from '../storage'
import type { StorageAdapter } from '../storage'

const VERSION = '2026.08.26.taro.1'
const KEY = 'biterstore:v2:asset-bundle'

export interface CacheAdapter {
  isReady(): Promise<boolean>
  warm(paths: string[], onProgress: (progress: number) => void): Promise<void>
  reset(): Promise<void>
}

export class TaroCacheAdapter implements CacheAdapter {
  constructor(private readonly storage: StorageAdapter = storageAdapter) {}

  async isReady() {
    return (await this.storage.get(KEY, '')) === VERSION
  }

  async warm(paths: string[], onProgress: (progress: number) => void) {
    let completed = 0
    for (const src of paths) {
      try {
        await Taro.getImageInfo({ src })
      } catch {
        // Packaged resources or H5 cache failures are fail-open.
      }
      completed += 1
      onProgress(Math.round((completed / Math.max(paths.length, 1)) * 100))
    }
    await this.storage.set(KEY, VERSION)
  }

  async reset() {
    await this.storage.remove(KEY)
  }
}

export const cacheAdapter = new TaroCacheAdapter()
