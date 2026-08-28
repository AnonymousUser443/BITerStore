import { BadGatewayException, BadRequestException, Controller, Get, NotFoundException, Param } from '@nestjs/common'

type OpenLibraryBook = {
  title?: string
  authors?: Array<{ name?: string }>
  publishers?: Array<{ name?: string }>
  publish_date?: string
  cover?: { large?: string; medium?: string; small?: string }
  subjects?: Array<{ name?: string }>
}

@Controller('books')
export class BooksController {
  @Get('isbn/:isbn')
  async isbn(@Param('isbn') rawIsbn: string) {
    const isbn = rawIsbn.replace(/[^0-9Xx]/g, '').toUpperCase()
    if (!/^\d{9}[\dX]$|^\d{13}$/.test(isbn)) throw new BadRequestException('ISBN 格式不正确')
    const key = `ISBN:${isbn}`
    let response: Response
    try {
      response = await fetch(`https://openlibrary.org/api/books?bibkeys=${encodeURIComponent(key)}&format=json&jscmd=data`, { signal: AbortSignal.timeout(6000) })
    } catch { throw new BadGatewayException('免费书目服务暂时不可用，请稍后重试') }
    if (!response.ok) throw new BadGatewayException('免费书目服务暂时不可用，请稍后重试')
    const value = (await response.json() as Record<string, OpenLibraryBook>)[key]
    if (!value?.title) throw new NotFoundException('没有查到这本书，请手动填写信息')
    return {
      isbn,
      title: value.title,
      author: (value.authors || []).map((item) => item.name).filter(Boolean).join(' / '),
      publisher: (value.publishers || []).map((item) => item.name).filter(Boolean).join(' / '),
      publishDate: value.publish_date || '',
      coverUrl: value.cover?.large || value.cover?.medium || value.cover?.small || '',
      subjects: (value.subjects || []).map((item) => item.name).filter(Boolean).slice(0, 5)
    }
  }
}
