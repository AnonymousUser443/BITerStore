import { createHmac } from 'node:crypto'
import { CanActivate, ExecutionContext, HttpException, HttpStatus, Injectable, Optional } from '@nestjs/common'
import type { FastifyReply, FastifyRequest } from 'fastify'
import { RedisService } from '../../infra/redis.service.js'
import { accessTokenSecret } from '../../common/security-config.js'

type LocalCounter = { count: number; resetAt: number }

function positiveLimit(value: string | undefined, fallback: number) {
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 && parsed <= 100_000 ? parsed : fallback
}

@Injectable()
export class PublicCatalogRateLimitGuard implements CanActivate {
  private readonly local = new Map<string, LocalCounter>()
  private localOperations = 0

  constructor(@Optional() private readonly redis?: RedisService) {}

  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<FastifyRequest>()
    const reply = context.switchToHttp().getResponse<FastifyReply>()
    const requestPath = String(request.url || '').split('?', 1)[0]
    const isMedia = /^\/api\/v1\/media\/[A-Za-z0-9_-]+$/.test(requestPath)
    const isDetail = Boolean((request.params as { id?: string } | undefined)?.id)
    const isSearch = !isDetail && Boolean(String((request.query as { q?: unknown } | undefined)?.q || '').trim())
    const bucket = isMedia ? 'media' : isDetail ? 'detail' : isSearch ? 'search' : 'list'
    const limit = positiveLimit(
      isMedia ? process.env.PUBLIC_MEDIA_RATE_PER_MINUTE
        : isDetail ? process.env.PUBLIC_CATALOG_DETAIL_RATE_PER_MINUTE
        : isSearch ? process.env.PUBLIC_CATALOG_SEARCH_RATE_PER_MINUTE
          : process.env.PUBLIC_CATALOG_LIST_RATE_PER_MINUTE,
      isMedia ? 180 : isDetail ? 120 : isSearch ? 30 : 60
    )
    const globalLimit = positiveLimit(isMedia ? process.env.PUBLIC_MEDIA_GLOBAL_RATE_PER_MINUTE : process.env.PUBLIC_CATALOG_GLOBAL_RATE_PER_MINUTE, isMedia ? 3600 : 1200)
    const address = request.ip || request.socket?.remoteAddress || 'unknown'
    const addressHash = createHmac('sha256', accessTokenSecret()).update(address).digest('base64url').slice(0, 24)
    const perClientKey = `ratelimit:catalog:${bucket}:${addressHash}`
    const globalKey = isMedia ? 'ratelimit:media:global' : 'ratelimit:catalog:global'

    const [count, globalCount, retryAfter] = await this.consume(perClientKey, globalKey)
    reply.header('X-RateLimit-Limit', String(limit))
    reply.header('X-RateLimit-Remaining', String(Math.max(0, limit - count)))
    if (count > limit || globalCount > globalLimit) {
      reply.header('Retry-After', String(retryAfter))
      throw new HttpException({ statusCode: 429, message: '访问过于频繁，请稍后重试' }, HttpStatus.TOO_MANY_REQUESTS)
    }
    return true
  }

  private async consume(perClientKey: string, globalKey: string): Promise<[number, number, number]> {
    if (this.redis) {
      try {
        await this.redis.ensureConnected()
        const result = await this.redis.client.eval(
          "local client = redis.call('INCR', KEYS[1]); local global = redis.call('INCR', KEYS[2]); if client == 1 then redis.call('EXPIRE', KEYS[1], ARGV[1]); end; if global == 1 then redis.call('EXPIRE', KEYS[2], ARGV[1]); end; local ttl = redis.call('TTL', KEYS[1]); return {client, global, ttl}",
          2, perClientKey, globalKey, 60
        ) as [number, number, number]
        return [Number(result[0]), Number(result[1]), Math.max(1, Number(result[2]) || 60)]
      } catch {
        // A bounded in-process fallback still protects each API process while
        // Redis is unavailable. The aggregate Nginx limit remains in front.
      }
    }
    const now = Date.now()
    const client = this.incrementLocal(perClientKey, now)
    const global = this.incrementLocal(globalKey, now)
    return [client.count, global.count, Math.max(1, Math.ceil((client.resetAt - now) / 1000))]
  }

  private incrementLocal(key: string, now: number) {
    this.localOperations += 1
    if (this.localOperations % 250 === 0) {
      for (const [storedKey, value] of this.local) if (value.resetAt <= now) this.local.delete(storedKey)
    }
    const current = this.local.get(key)
    if (!current || current.resetAt <= now) {
      const created = { count: 1, resetAt: now + 60_000 }
      this.local.set(key, created)
      return created
    }
    current.count += 1
    return current
  }
}
