import { Module } from '@nestjs/common'
import { AuthGuard } from '../../common/auth.js'
import { IdentityModule } from '../identity/identity.module.js'
import { AuthController } from './auth.controller.js'
import { AuthService } from './auth.service.js'

@Module({ imports: [IdentityModule], controllers: [AuthController], providers: [AuthService, AuthGuard], exports: [AuthService] })
export class AuthModule {}
