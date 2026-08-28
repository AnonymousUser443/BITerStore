import { Module } from '@nestjs/common'
import { AuthGuard, VerifiedGuard } from '../../common/auth.js'
import { ModerationController } from './moderation.controller.js'
@Module({ controllers: [ModerationController], providers: [AuthGuard, VerifiedGuard] })
export class ModerationModule {}
