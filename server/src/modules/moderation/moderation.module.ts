import { Module } from '@nestjs/common'
import { AuthGuard, NotMutedGuard, VerifiedGuard } from '../../common/auth.js'
import { ModerationController } from './moderation.controller.js'
@Module({ controllers: [ModerationController], providers: [AuthGuard, NotMutedGuard, VerifiedGuard] })
export class ModerationModule {}
