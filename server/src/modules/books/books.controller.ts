import { BadRequestException, Body, Controller, Get, Headers, Param, Post, UseGuards } from '@nestjs/common'
import { AuthGuard, CurrentUser, VerifiedGuard, type AuthUser } from '../../common/auth.js'
import { BooksService } from './books.service.js'

@Controller('books')
export class BooksController {
  constructor(private readonly books: BooksService) {}

  @Get('isbn/:isbn')
  @UseGuards(AuthGuard, VerifiedGuard)
  isbn(@Param('isbn') isbn: string) {
    return this.books.lookup(isbn)
  }

  @Post('isbn/recognize')
  @UseGuards(AuthGuard, VerifiedGuard)
  recognize(@CurrentUser() user: AuthUser, @Body() body: Buffer, @Headers('content-type') contentType = '') {
    if (!/^image\/(jpeg|png|webp)(?:;|$)/i.test(contentType)) throw new BadRequestException('仅支持 JPEG、PNG 或 WebP 图片')
    return this.books.recognize(body, user.id, contentType.split(';', 1)[0].toLowerCase())
  }
}
