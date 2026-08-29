import { BadGatewayException, BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { prepareZXingModule, readBarcodes } from 'zxing-wasm/reader'
import { RedisService } from '../../infra/redis.service.js'

export type BookMetadata = {
  isbn: string
  title: string
  author: string
  publisher: string
  publishDate: string
  coverUrl: string
  subjects: string[]
}

type OpenLibraryBook = {
  title?: string
  authors?: Array<{ name?: string }>
  publishers?: Array<{ name?: string }>
  publish_date?: string
  cover?: { large?: string; medium?: string; small?: string }
  subjects?: Array<{ name?: string }>
}

const CACHE_SECONDS = 30 * 24 * 60 * 60
const NOT_FOUND_CACHE_SECONDS = 24 * 60 * 60
let zxingReady: Promise<unknown> | undefined

const CHINESE_METADATA_OVERRIDES: Record<string, Omit<BookMetadata, 'isbn'>> = {
  '9787111544937': {
    title: '深入理解计算机系统（原书第3版）',
    author: '[美] 兰德尔·E. 布莱恩特 / 戴维·R. 奥哈拉伦',
    publisher: '机械工业出版社',
    publishDate: '2016-11',
    coverUrl: 'https://covers.openlibrary.org/b/id/12839779-L.jpg',
    subjects: ['计算机科学', '计算机系统']
  },
  '9787111213826': {
    title: 'Java编程思想（第4版）',
    author: '[美] 布鲁斯·埃克尔',
    publisher: '机械工业出版社',
    publishDate: '2007',
    coverUrl: 'https://covers.openlibrary.org/b/id/9432160-L.jpg',
    subjects: ['Java', '程序设计']
  },
  '9787201086521': {
    title: '汉字树3：植物里的汉字之美',
    author: '廖文豪',
    publisher: '甘肃人民美术出版社',
    publishDate: '2014-11',
    coverUrl: '',
    subjects: ['汉字', '文字学']
  }
}

function chineseMetadataOverride(isbn: string): BookMetadata | null {
  const value = CHINESE_METADATA_OVERRIDES[isbn]
  return value ? { isbn, ...value } : null
}

export function normalizeIsbn(raw: string) {
  return raw.replace(/[^0-9Xx]/g, '').toUpperCase()
}

export function isValidIsbn(isbn: string) {
  if (/^\d{13}$/.test(isbn)) {
    const sum = isbn.slice(0, 12).split('').reduce((total, value, index) => total + Number(value) * (index % 2 ? 3 : 1), 0)
    return (10 - sum % 10) % 10 === Number(isbn[12])
  }
  if (/^\d{9}[\dX]$/.test(isbn)) {
    const sum = isbn.split('').reduce((total, value, index) => total + (value === 'X' ? 10 : Number(value)) * (10 - index), 0)
    return sum % 11 === 0
  }
  return false
}

async function ensureZxing() {
  if (!zxingReady) {
    zxingReady = readFile(fileURLToPath(import.meta.resolve('zxing-wasm/reader/zxing_reader.wasm')))
      .then((bytes) => {
        const wasmBinary = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
        return prepareZXingModule({ overrides: { wasmBinary }, fireImmediately: true })
      })
  }
  return zxingReady
}

function metadataFromOpenLibrary(isbn: string, value: OpenLibraryBook): BookMetadata | null {
  if (!value.title) return null
  return {
    isbn,
    title: value.title,
    author: (value.authors || []).map((item) => item.name).filter(Boolean).join(' / '),
    publisher: (value.publishers || []).map((item) => item.name).filter(Boolean).join(' / '),
    publishDate: value.publish_date || '',
    coverUrl: value.cover?.large || value.cover?.medium || value.cover?.small || '',
    subjects: (value.subjects || []).map((item) => item.name).filter((name): name is string => Boolean(name)).slice(0, 5)
  }
}

function normalizedProxyMetadata(isbn: string, value: Partial<BookMetadata>): BookMetadata | null {
  if (!value.title?.trim()) return null
  return {
    isbn,
    title: value.title.trim().slice(0, 200),
    author: String(value.author || '').trim().slice(0, 200),
    publisher: String(value.publisher || '').trim().slice(0, 200),
    publishDate: String(value.publishDate || '').trim().slice(0, 40),
    coverUrl: String(value.coverUrl || '').trim().slice(0, 1000),
    subjects: Array.isArray(value.subjects) ? value.subjects.map(String).map((item) => item.slice(0, 100)).slice(0, 5) : []
  }
}

@Injectable()
export class BooksService {
  private readonly inflight = new Map<string, Promise<BookMetadata>>()
  constructor(private readonly redis: RedisService) {}

  async recognize(body: Buffer) {
    if (!Buffer.isBuffer(body) || body.length === 0 || body.length > 5 * 1024 * 1024) throw new BadRequestException('图片为空或超过 5MB')
    try {
      await ensureZxing()
      const results = await readBarcodes(new Uint8Array(body), { formats: ['EAN13'], tryHarder: true, tryRotate: true, maxNumberOfSymbols: 4 })
      const isbn = results.map((result) => normalizeIsbn(result.text)).find(isValidIsbn)
      if (!isbn) throw new NotFoundException('没有识别到清晰的 ISBN 条码，请重新拍摄或手动填写')
      return { isbn }
    } catch (cause) {
      if (cause instanceof NotFoundException) throw cause
      throw new BadGatewayException('条码识别暂时不可用，请手动填写 ISBN')
    }
  }

  async lookup(rawIsbn: string): Promise<BookMetadata> {
    const isbn = normalizeIsbn(rawIsbn)
    if (!isValidIsbn(isbn)) throw new BadRequestException('ISBN 格式或校验位不正确')
    const corrected = chineseMetadataOverride(isbn)
    if (corrected) return corrected
    const cacheKey = `book-metadata:v3:${isbn}`
    await this.redis.ensureConnected()
    const cached = await this.redis.client.get(cacheKey)
    if (cached === 'NOT_FOUND') throw new NotFoundException('没有查到这本书，请手动填写信息')
    if (cached) return JSON.parse(cached) as BookMetadata
    const pending = this.inflight.get(isbn)
    if (pending) return pending
    const request = this.fetchAndCache(isbn, cacheKey).finally(() => this.inflight.delete(isbn))
    this.inflight.set(isbn, request)
    return request
  }

  private async fetchAndCache(isbn: string, cacheKey: string) {
    let metadata: BookMetadata | null = null
    try {
      const proxyBase = process.env.BOOK_METADATA_PROXY_URL?.replace(/\/$/, '')
      if (proxyBase) {
        const response = await fetch(`${proxyBase}/isbn/${encodeURIComponent(isbn)}`, {
          headers: process.env.BOOK_METADATA_PROXY_TOKEN ? { Authorization: `Bearer ${process.env.BOOK_METADATA_PROXY_TOKEN}` } : undefined,
          signal: AbortSignal.timeout(8000)
        })
        if (response.status !== 404 && !response.ok) throw new Error(`proxy status ${response.status}`)
        if (response.ok) metadata = normalizedProxyMetadata(isbn, await response.json() as Partial<BookMetadata>)
      } else {
        const key = `ISBN:${isbn}`
        const response = await fetch(`https://openlibrary.org/api/books?bibkeys=${encodeURIComponent(key)}&format=json&jscmd=data`, {
          headers: { 'User-Agent': process.env.BOOK_METADATA_USER_AGENT || 'BITerStore/1.0 (https://store.young581.com)' },
          signal: AbortSignal.timeout(8000)
        })
        if (!response.ok) throw new Error(`openlibrary status ${response.status}`)
        metadata = metadataFromOpenLibrary(isbn, (await response.json() as Record<string, OpenLibraryBook>)[key] || {})
      }
    } catch {
      throw new BadGatewayException('免费书目服务暂时不可用，请稍后重试或手动填写')
    }
    if (isbn.startsWith('9787') && metadata && !/[\u3400-\u9fff]/u.test(metadata.title)) {
      throw new NotFoundException('免费书目源仅返回了英文或拼音书名，请手动填写中文书名')
    }
    if (!metadata) {
      await this.redis.client.set(cacheKey, 'NOT_FOUND', 'EX', NOT_FOUND_CACHE_SECONDS)
      throw new NotFoundException('没有查到这本书，请手动填写信息')
    }
    await this.redis.client.set(cacheKey, JSON.stringify(metadata), 'EX', CACHE_SECONDS)
    return metadata
  }
}
