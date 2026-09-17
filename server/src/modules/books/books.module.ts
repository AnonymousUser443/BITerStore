import { Module } from '@nestjs/common'
import { AuthGuard, VerifiedGuard } from '../../common/auth.js'
import { BooksController } from './books.controller.js'
import { BooksService } from './books.service.js'

@Module({ controllers: [BooksController], providers: [BooksService, AuthGuard, VerifiedGuard] })
export class BooksModule {}
