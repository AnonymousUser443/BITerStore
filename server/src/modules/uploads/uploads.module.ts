import { Module } from '@nestjs/common'
import { AuthGuard } from '../../common/auth.js'
import { UploadsController } from './uploads.controller.js'
@Module({ controllers: [UploadsController], providers: [AuthGuard] })
export class UploadsModule {}
