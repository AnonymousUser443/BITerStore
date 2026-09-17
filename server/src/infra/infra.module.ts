import { Global, Module } from '@nestjs/common'
import { CatalogCacheService } from './catalog-cache.service.js'
import { PrismaService } from './prisma.service.js'
import { RedisService } from './redis.service.js'
@Global() @Module({ providers: [PrismaService, RedisService, CatalogCacheService], exports: [PrismaService, RedisService, CatalogCacheService] })
export class InfraModule {}
