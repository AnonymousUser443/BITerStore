import { Module } from '@nestjs/common'
import { AdminGuard, AuthGuard, CampusVerifiedGuard, NotMutedGuard } from '../../common/auth.js'
import { UploadsController } from './uploads.controller.js'
import { MediaController } from './media.controller.js'
import { PublicCatalogRateLimitGuard } from '../listings/public-catalog-rate-limit.guard.js'
@Module({ controllers: [UploadsController, MediaController], providers: [AuthGuard, AdminGuard, CampusVerifiedGuard, NotMutedGuard, PublicCatalogRateLimitGuard] })
export class UploadsModule {}
