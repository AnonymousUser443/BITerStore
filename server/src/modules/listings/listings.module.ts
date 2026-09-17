import { Module } from '@nestjs/common'
import { AuthGuard, NotMutedGuard, VerifiedGuard } from '../../common/auth.js'
import { ListingsController } from './listings.controller.js'
import { ListingsService } from './listings.service.js'
import { PublicCatalogRateLimitGuard } from './public-catalog-rate-limit.guard.js'
@Module({ controllers: [ListingsController], providers: [ListingsService, AuthGuard, NotMutedGuard, VerifiedGuard, PublicCatalogRateLimitGuard] })
export class ListingsModule {}
