import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { PrismaService } from './infra/prisma.service.js'
import { RedisService } from './infra/redis.service.js'
import { AuthModule } from './modules/auth/auth.module.js'
import { IdentityModule } from './modules/identity/identity.module.js'
import { UsersModule } from './modules/users/users.module.js'
import { ListingsModule } from './modules/listings/listings.module.js'
import { ConversationsModule } from './modules/conversations/conversations.module.js'
import { ModerationModule } from './modules/moderation/moderation.module.js'
import { UploadsModule } from './modules/uploads/uploads.module.js'
import { AdminModule } from './modules/admin/admin.module.js'
import { HealthController } from './health.controller.js'
import { InfraModule } from './infra/infra.module.js'

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true }), InfraModule, AuthModule, IdentityModule, UsersModule, ListingsModule, ConversationsModule, ModerationModule, UploadsModule, AdminModule],
  controllers: [HealthController],
  providers: []
})
export class AppModule {}
