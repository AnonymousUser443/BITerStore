import { Global, Module } from '@nestjs/common'
import { PrismaService } from './prisma.service.js'
import { RedisService } from './redis.service.js'
@Global() @Module({ providers: [PrismaService, RedisService], exports: [PrismaService, RedisService] })
export class InfraModule {}
