import { Module } from '@nestjs/common'
import { AuthGuard, VerifiedGuard } from '../../common/auth.js'
import { UsersController } from './users.controller.js'
@Module({ controllers: [UsersController], providers: [AuthGuard, VerifiedGuard] })
export class UsersModule {}
