import { BadRequestException } from '@nestjs/common'
import { ListingStatus } from '@prisma/client'

const CAMPUSES = new Set(['中关村', '良乡', '西山', '珠海'])
const CONDITIONS = new Set(['全新', '九成新', '八成新', '七成新及以下'])
const CREATE_FIELDS = new Set(['title', 'author', 'isbn', 'category', 'course', 'priceCents', 'originalPriceCents', 'condition', 'campus', 'description', 'tags', 'imageIds', 'draft', 'clientRequestId'])
const UPDATE_FIELDS = new Set(['title', 'author', 'isbn', 'category', 'course', 'priceCents', 'originalPriceCents', 'condition', 'campus', 'description', 'tags', 'version'])
const OWNER_STATUSES = new Set<ListingStatus>(['ACTIVE', 'RESERVED', 'SOLD', 'OFF_SHELF', 'PENDING_REVIEW', 'CHANGES_REQUESTED'])

type Input = Record<string, unknown>

export type CreateListingInput = {
  title: string
  author: string
  isbn: string
  category: string
  course: string
  priceCents: number
  originalPriceCents: number | null
  condition: string
  campus: string
  description: string
  tags: string[]
  imageIds: string[]
  draft: boolean
  clientRequestId: string | null
}

export type UpdateListingInput = Partial<Omit<CreateListingInput, 'imageIds' | 'draft' | 'clientRequestId'>> & { version: number }

function record(value: unknown): Input {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new BadRequestException('请求体必须是对象')
  return value as Input
}

function rejectUnknown(value: Input, allowed: Set<string>) {
  const unknown = Object.keys(value).filter((key) => !allowed.has(key))
  if (unknown.length) throw new BadRequestException(`包含不支持的字段：${unknown.join(', ')}`)
}

function text(value: unknown, name: string, maximum: number, required = false) {
  if (typeof value !== 'string') throw new BadRequestException(`${name}格式不正确`)
  const normalized = value.normalize('NFKC').trim()
  if (required && !normalized) throw new BadRequestException(`${name}不能为空`)
  if (normalized.length > maximum) throw new BadRequestException(`${name}不能超过 ${maximum} 个字符`)
  return normalized
}

function price(value: unknown, name: string, nullable: true): number | null
function price(value: unknown, name: string, nullable?: false): number
function price(value: unknown, name: string, nullable = false): number | null {
  if (nullable && (value === null || value === undefined || value === '')) return null
  if (!Number.isSafeInteger(value) || Number(value) <= 0 || Number(value) > 10_000_000) throw new BadRequestException(`${name}必须是 1–10000000 的整数分值`)
  return Number(value)
}

function isbn(value: unknown) {
  const normalized = text(value, 'ISBN', 32).replace(/[^0-9Xx]/g, '').toUpperCase()
  if (normalized && !/^(?:\d{13}|\d{9}[\dX])$/.test(normalized)) throw new BadRequestException('ISBN 应为 10 位或 13 位')
  return normalized
}

function campus(value: unknown) {
  const normalized = text(value, '校区', 20, true)
  if (!CAMPUSES.has(normalized)) throw new BadRequestException('校区不在允许范围内')
  return normalized
}

function condition(value: unknown) {
  const normalized = text(value, '成色', 20, true)
  if (!CONDITIONS.has(normalized)) throw new BadRequestException('成色不在允许范围内')
  return normalized
}

function tags(value: unknown) {
  if (!Array.isArray(value) || value.length > 8) throw new BadRequestException('标签必须是不超过 8 项的数组')
  return [...new Set(value.map((item) => text(item, '标签', 20, true)))]
}

function imageIds(value: unknown) {
  if (!Array.isArray(value) || value.length > 6) throw new BadRequestException('图片必须是不超过 6 项的数组')
  return [...new Set(value.map((item) => {
    const id = text(item, '图片 ID', 100, true)
    if (!/^[A-Za-z0-9_-]+$/.test(id)) throw new BadRequestException('图片 ID 格式不正确')
    return id
  }))]
}

function version(value: unknown) {
  if (!Number.isSafeInteger(value) || Number(value) < 0) throw new BadRequestException('商品版本号无效')
  return Number(value)
}

export function normalizeCreateListing(value: unknown): CreateListingInput {
  const body = record(value)
  rejectUnknown(body, CREATE_FIELDS)
  if (body.draft !== undefined && typeof body.draft !== 'boolean') throw new BadRequestException('draft 必须是布尔值')
  const requestId = body.clientRequestId === undefined || body.clientRequestId === null ? null : text(body.clientRequestId, '请求 ID', 100, true)
  if (requestId && !/^[A-Za-z0-9._:-]+$/.test(requestId)) throw new BadRequestException('请求 ID 格式不正确')
  return {
    title: text(body.title, '标题', 100, true),
    author: text(body.author ?? '', '作者', 80),
    isbn: isbn(body.isbn ?? ''),
    category: text(body.category, '分类', 30, true),
    course: text(body.course ?? '', '课程', 60),
    priceCents: price(body.priceCents, '价格'),
    originalPriceCents: price(body.originalPriceCents, '原价', true),
    condition: condition(body.condition),
    campus: campus(body.campus),
    description: text(body.description ?? '', '商品简介', 1000),
    tags: tags(body.tags ?? []),
    imageIds: imageIds(body.imageIds ?? []),
    draft: body.draft === true,
    clientRequestId: requestId
  }
}

export function normalizeUpdateListing(value: unknown): UpdateListingInput {
  const body = record(value)
  rejectUnknown(body, UPDATE_FIELDS)
  const result: UpdateListingInput = { version: version(body.version) }
  if ('title' in body) result.title = text(body.title, '标题', 100, true)
  if ('author' in body) result.author = text(body.author, '作者', 80)
  if ('isbn' in body) result.isbn = isbn(body.isbn)
  if ('category' in body) result.category = text(body.category, '分类', 30, true)
  if ('course' in body) result.course = text(body.course, '课程', 60)
  if ('priceCents' in body) result.priceCents = price(body.priceCents, '价格')
  if ('originalPriceCents' in body) result.originalPriceCents = price(body.originalPriceCents, '原价', true)
  if ('condition' in body) result.condition = condition(body.condition)
  if ('campus' in body) result.campus = campus(body.campus)
  if ('description' in body) result.description = text(body.description, '商品简介', 1000)
  if ('tags' in body) result.tags = tags(body.tags)
  if (Object.keys(result).length === 1) throw new BadRequestException('至少提供一个需要修改的字段')
  return result
}

export function normalizeListingStatus(value: unknown) {
  const body = record(value)
  rejectUnknown(body, new Set(['status', 'version']))
  if (typeof body.status !== 'string' || !OWNER_STATUSES.has(body.status as ListingStatus)) throw new BadRequestException('商品状态无效')
  return { status: body.status as ListingStatus, version: version(body.version) }
}
