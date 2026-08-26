export interface StorageAdapter {
  get<T>(key: string, fallback: T): Promise<T>
  set<T>(key: string, value: T): Promise<void>
  remove(key: string): Promise<void>
  clearOwned(keys: string[]): Promise<void>
}

const getTaro = async () => (await import('@tarojs/taro')).default

function normalizeStored<T>(value: unknown, fallback: T): T {
  if (value === undefined || value === null || value === '') return fallback
  if (typeof value !== 'string') return value as T
  try {
    return JSON.parse(value) as T
  } catch {
    return value as T
  }
}

export class TaroStorageAdapter implements StorageAdapter {
  async get<T>(key: string, fallback: T): Promise<T> {
    try {
      const Taro = await getTaro()
      const result = await Taro.getStorage({ key })
      return normalizeStored(result.data, fallback)
    } catch {
      return fallback
    }
  }

  async set<T>(key: string, value: T): Promise<void> {
    const Taro = await getTaro()
    await Taro.setStorage({ key, data: value })
  }

  async remove(key: string): Promise<void> {
    try {
      const Taro = await getTaro()
      await Taro.removeStorage({ key })
    } catch {
      // Removing a missing key is intentionally idempotent.
    }
  }

  async clearOwned(keys: string[]): Promise<void> {
    await Promise.all(keys.map((key) => this.remove(key)))
  }
}

export class MemoryStorageAdapter implements StorageAdapter {
  private readonly data = new Map<string, unknown>()

  async get<T>(key: string, fallback: T): Promise<T> {
    return this.data.has(key) ? structuredClone(this.data.get(key) as T) : structuredClone(fallback)
  }

  async set<T>(key: string, value: T): Promise<void> {
    this.data.set(key, structuredClone(value))
  }

  async remove(key: string): Promise<void> {
    this.data.delete(key)
  }

  async clearOwned(keys: string[]): Promise<void> {
    keys.forEach((key) => this.data.delete(key))
  }
}

export const storageAdapter = new TaroStorageAdapter()
