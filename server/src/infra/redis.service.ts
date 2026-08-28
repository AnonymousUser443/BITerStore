import { Injectable, OnModuleDestroy } from '@nestjs/common'
import { Redis } from 'ioredis'

@Injectable()
export class RedisService implements OnModuleDestroy {
  readonly client = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', { lazyConnect: true, maxRetriesPerRequest: 1 })
  async ensureConnected() { if (this.client.status === 'wait') await this.client.connect() }
  async onModuleDestroy() { if (this.client.status !== 'end') this.client.disconnect() }
}
