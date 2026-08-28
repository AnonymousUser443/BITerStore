import { Module } from '@nestjs/common'
import { AuthGuard } from '../../common/auth.js'
import { IdentityController } from './identity.controller.js'
import { IdentityService } from './identity.service.js'
@Module({ controllers: [IdentityController], providers: [IdentityService, AuthGuard], exports: [IdentityService] })
export class IdentityModule {}
