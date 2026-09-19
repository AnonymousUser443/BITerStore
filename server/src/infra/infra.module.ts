import { Global, Module } from '@nestjs/common'
import { CatalogCacheService } from './catalog-cache.service.js'
import { PrismaService } from './prisma.service.js'
import { RedisService } from './redis.service.js'
import { TrafficMetricsService } from './traffic-metrics.service.js'
@Global() @Module({ providers: [PrismaService, RedisService, CatalogCacheService, TrafficMetricsService], exports: [PrismaService, RedisService, CatalogCacheService, TrafficMetricsService] })
export class InfraModule {}
