import { Injectable, OnModuleDestroy } from '@nestjs/common'
import { Redis } from 'ioredis'

@Injectable()
export class RedisService implements OnModuleDestroy {
  readonly client = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
    lazyConnect: true,
    // The production ACL intentionally does not expose INFO. Disabling the
    // ioredis ready check avoids a repeated INFO failure and its retry delay.
    enableReadyCheck: false,
    maxRetriesPerRequest: 1,
    username: process.env.REDIS_USERNAME || undefined,
    password: process.env.REDIS_PASSWORD || undefined
  })
  async ensureConnected() { if (this.client.status === 'wait') await this.client.connect() }
  async onModuleDestroy() { if (this.client.status !== 'end') this.client.disconnect() }
}
