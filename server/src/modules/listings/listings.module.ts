import { Module } from '@nestjs/common'
import { AuthGuard, NotMutedGuard, VerifiedGuard } from '../../common/auth.js'
import { ListingsController } from './listings.controller.js'
import { ListingsService } from './listings.service.js'
@Module({ controllers: [ListingsController], providers: [ListingsService, AuthGuard, NotMutedGuard, VerifiedGuard] })
export class ListingsModule {}
