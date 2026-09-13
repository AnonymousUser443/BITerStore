import { BadRequestException, Body, Controller, Get, Headers, Param, Post, UseGuards } from '@nestjs/common'
import { AuthGuard } from '../../common/auth.js'
import { ImageValidationError, inspectImage } from '../../common/image-validation.js'
import { BooksService } from './books.service.js'

@Controller('books')
export class BooksController {
  constructor(private readonly books: BooksService) {}

  @Get('isbn/:isbn')
  isbn(@Param('isbn') isbn: string) {
    return this.books.lookup(isbn)
  }

  @Post('isbn/recognize')
  @UseGuards(AuthGuard)
  recognize(@Body() body: Buffer, @Headers('content-type') contentType = '') {
    if (!/^image\/(jpeg|png|webp)(?:;|$)/i.test(contentType)) throw new BadRequestException('仅支持 JPEG、PNG 或 WebP 图片')
    try {
      inspectImage(body, contentType)
    } catch (cause) {
      if (cause instanceof ImageValidationError) throw new BadRequestException(`图片校验失败：${cause.message}`)
      throw cause
    }
    return this.books.recognize(body)
  }
}
