import { Module } from '@nestjs/common'
import { AuthGuard } from '../../common/auth.js'
import { UsersController } from './users.controller.js'
@Module({ controllers: [UsersController], providers: [AuthGuard] })
export class UsersModule {}
