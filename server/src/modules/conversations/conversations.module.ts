import { Module } from '@nestjs/common'
import { AuthGuard, CampusVerifiedGuard, VerifiedGuard } from '../../common/auth.js'
import { ConversationsController } from './conversations.controller.js'
import { ConversationsService } from './conversations.service.js'
@Module({ controllers: [ConversationsController], providers: [ConversationsService, AuthGuard, CampusVerifiedGuard, VerifiedGuard] })
export class ConversationsModule {}
