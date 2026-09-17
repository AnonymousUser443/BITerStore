import { createHash } from 'node:crypto'
import { Injectable } from '@nestjs/common'
import { RedisService } from './redis.service.js'

const VERSION_KEY = 'catalog:public:version'

function positiveSeconds(value: string | undefined, fallback: number) {
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 && parsed <= 300 ? parsed : fallback
}

@Injectable()
export class CatalogCacheService {
  private readonly inFlight = new Map<string, Promise<unknown>>()

  constructor(private readonly redis: RedisService) {}

  async publicList<T>(canonicalQuery: unknown, loader: () => Promise<T>): Promise<T> {
    const digest = createHash('sha256').update(JSON.stringify(canonicalQuery)).digest('base64url').slice(0, 24)
    return this.cached(`list:${digest}`, positiveSeconds(process.env.PUBLIC_CATALOG_LIST_CACHE_SECONDS, 20), loader)
  }

  async publicDetail<T>(id: string, loader: () => Promise<T>): Promise<T> {
    const digest = createHash('sha256').update(id).digest('base64url').slice(0, 24)
    return this.cached(`detail:${digest}`, positiveSeconds(process.env.PUBLIC_CATALOG_DETAIL_CACHE_SECONDS, 30), loader)
  }

  async invalidate() {
    if (process.env.PUBLIC_CATALOG_CACHE_ENABLED === 'false') return
    try {
      await this.redis.ensureConnected()
      await this.redis.client.incr(VERSION_KEY)
    } catch {
      // Cache invalidation must never make a successful write fail. Cached
      // entries also carry short TTLs, so a Redis outage remains bounded.
    }
  }

  private async cached<T>(suffix: string, ttlSeconds: number, loader: () => Promise<T>): Promise<T> {
    if (process.env.PUBLIC_CATALOG_CACHE_ENABLED === 'false') return loader()

    let version: string
    try {
      await this.redis.ensureConnected()
      version = await this.redis.client.get(VERSION_KEY) || '1'
      await this.redis.client.set(VERSION_KEY, version, 'NX')
    } catch {
      return this.coalesced(`local:${suffix}`, loader)
    }

    const key = `catalog:public:v${version}:${suffix}`
    try {
      const raw = await this.redis.client.get(key)
      if (raw) return JSON.parse(raw) as T
    } catch {
      return this.coalesced(`local:${suffix}`, loader)
    }

    return this.coalesced(key, async () => {
      try {
        const secondRead = await this.redis.client.get(key)
        if (secondRead) return JSON.parse(secondRead) as T
      } catch {
        // Continue with the source query and return it even if Redis is down.
      }
      const value = await loader()
      try { await this.redis.client.setex(key, ttlSeconds, JSON.stringify(value)) } catch { /* bounded cache miss */ }
      return value
    })
  }

  private coalesced<T>(key: string, loader: () => Promise<T>): Promise<T> {
    const existing = this.inFlight.get(key) as Promise<T> | undefined
    if (existing) return existing
    const pending = loader().finally(() => this.inFlight.delete(key))
    this.inFlight.set(key, pending)
    return pending
  }
}
