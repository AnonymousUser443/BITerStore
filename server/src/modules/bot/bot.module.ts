import { Module } from '@nestjs/common'
import { BotGuard } from '../../common/bot-auth.js'
import { BotController } from './bot.controller.js'

@Module({ controllers: [BotController], providers: [BotGuard] })
export class BotModule {}
