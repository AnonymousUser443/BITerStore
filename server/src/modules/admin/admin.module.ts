import { Module } from '@nestjs/common'
import { AdminGuard, AuthGuard } from '../../common/auth.js'
import { AdminController } from './admin.controller.js'
import { AdminSecurityController } from './admin-security.controller.js'
@Module({ controllers: [AdminController, AdminSecurityController], providers: [AuthGuard, AdminGuard] })
export class AdminModule {}
