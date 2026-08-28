import { Module } from '@nestjs/common'
import { AuthGuard, VerifiedGuard } from '../../common/auth.js'
import { ConversationsController } from './conversations.controller.js'
import { ConversationsService } from './conversations.service.js'
@Module({ controllers: [ConversationsController], providers: [ConversationsService, AuthGuard, VerifiedGuard] })
export class ConversationsModule {}
