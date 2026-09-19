import { Injectable } from '@nestjs/common'
import { createHmac } from 'node:crypto'
import { RedisService } from './redis.service.js'
import { accessTokenSecret } from '../common/security-config.js'

type TrafficRequest = {
  ip?: string
  headers?: Record<string, unknown>
  user?: { id?: string }
  url?: string
  method?: string
}

type TrafficReply = { statusCode?: number }

function dayKey(date = new Date()) {
  return date.toISOString().slice(0, 10)
}

function hourKey(date = new Date()) {
  return date.toISOString().slice(11, 13)
}

@Injectable()
export class TrafficMetricsService {
  constructor(private readonly redis: RedisService) {}

  async record(request: TrafficRequest, reply: TrafficReply) {
    try {
      await this.redis.ensureConnected()
      const now = new Date()
      const day = dayKey(now)
      const key = `metrics:traffic:${day}`
      const status = Number(reply.statusCode || 0)
      const statusClass = status >= 500 ? '5xx' : status >= 400 ? '4xx' : status >= 300 ? '3xx' : '2xx'
      const path = (request.url || '/').split('?', 1)[0].slice(0, 120)
      const method = (request.method || 'UNKNOWN').toUpperCase().slice(0, 12)
      const visitor = this.visitorKey(request, day)
      const pipeline = this.redis.client.pipeline()
      pipeline.hincrby(key, 'requests', 1)
      pipeline.hincrby(key, `status:${statusClass}`, 1)
      pipeline.hincrby(key, `hour:${hourKey(now)}:requests`, 1)
      pipeline.hincrby(key, `method:${method}`, 1)
      pipeline.hincrby(key, `path:${path}`, 1)
      pipeline.expire(key, 60 * 60 * 24 * 15)
      pipeline.pfadd(`metrics:visitors:${day}`, visitor)
      pipeline.expire(`metrics:visitors:${day}`, 60 * 60 * 24 * 15)
      await pipeline.exec()
    } catch {
      // Metrics must never make a user request fail when Redis is unavailable.
    }
  }

  async summary(days = 1) {
    await this.redis.ensureConnected()
    const count = Math.min(14, Math.max(1, Math.trunc(days)))
    const result: Array<Record<string, unknown>> = []
    for (let offset = 0; offset < count; offset += 1) {
      const date = new Date(Date.now() - offset * 24 * 60 * 60 * 1000)
      const day = dayKey(date)
      const key = `metrics:traffic:${day}`
      const [traffic, visitors] = await Promise.all([
        this.redis.client.hgetall(key),
        this.redis.client.pfcount(`metrics:visitors:${day}`)
      ])
      const hourly = Array.from({ length: 24 }, (_, hour) => traffic[`hour:${String(hour).padStart(2, '0')}:requests`] || '0')
      result.push({
        date: day,
        requests: Number(traffic.requests || 0),
        visitors,
        status: { '2xx': Number(traffic['status:2xx'] || 0), '3xx': Number(traffic['status:3xx'] || 0), '4xx': Number(traffic['status:4xx'] || 0), '5xx': Number(traffic['status:5xx'] || 0) },
        hourlyRequests: hourly.map(Number)
      })
    }
    return { days: result, generatedAt: new Date().toISOString() }
  }

  private visitorKey(request: TrafficRequest, day: string) {
    const identity = request.user?.id
      ? `user:${request.user.id}`
      : `anonymous:${request.ip || 'unknown'}|${String(request.headers?.['user-agent'] || '').slice(0, 240)}`
    return createHmac('sha256', accessTokenSecret()).update(`${day}|${identity}`).digest('base64url')
  }
}
