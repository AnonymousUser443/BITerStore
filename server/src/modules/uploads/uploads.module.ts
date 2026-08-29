import { Module } from '@nestjs/common'
import { AuthGuard } from '../../common/auth.js'
import { UploadsController } from './uploads.controller.js'
import { MediaController } from './media.controller.js'
@Module({ controllers: [UploadsController, MediaController], providers: [AuthGuard] })
export class UploadsModule {}
