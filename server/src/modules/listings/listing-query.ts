import { BadRequestException } from '@nestjs/common'

export const listingCampuses = ['中关村', '良乡', '西山', '珠海'] as const
export const listingCategories = ['教材教辅', '专业课', '考研考公', '文学小说', '其他'] as const
export const listingConditions = ['全新', '九成新', '八成新', '七成新及以下'] as const
export const listingSorts = ['newest', 'price_asc', 'price_desc'] as const

export type ListingSort = typeof listingSorts[number]
export type ListingQueryInput = Record<string, unknown>
export type NormalizedListingQuery = {
  q?: string
  campus?: typeof listingCampuses[number]
  category?: typeof listingCategories[number]
  condition?: typeof listingConditions[number]
  minPriceCents?: number
  maxPriceCents?: number
  sort: ListingSort
  cursor?: string
  limit: number
  mine: boolean
}

const allowedKeys = new Set([
  'q', 'campus', 'category', 'condition', 'minPriceCents', 'maxPriceCents',
  'sort', 'cursor', 'limit', 'mine', 'availableOnly'
])

function optionalString(value: unknown, label: string) {
  if (value === undefined || value === null || value === '') return undefined
  if (typeof value !== 'string') throw new BadRequestException(`${label}格式无效`)
  return value.trim().normalize('NFKC') || undefined
}

function optionalEnum<T extends readonly string[]>(value: unknown, values: T, label: string) {
  const normalized = optionalString(value, label)
  if (!normalized || normalized === '全部') return undefined
  if (!values.includes(normalized)) throw new BadRequestException(`${label}选项无效`)
  return normalized as T[number]
}

function optionalInteger(value: unknown, label: string, minimum: number, maximum: number) {
  if (value === undefined || value === null || value === '') return undefined
  const raw = typeof value === 'number' ? String(value) : value
  if (typeof raw !== 'string' || !/^\d+$/.test(raw)) throw new BadRequestException(`${label}必须是整数`)
  const parsed = Number(raw)
  if (!Number.isSafeInteger(parsed) || parsed < minimum || parsed > maximum) throw new BadRequestException(`${label}超出允许范围`)
  return parsed
}

export function normalizeListingQuery(query: ListingQueryInput, allowMine = false): NormalizedListingQuery {
  const unknown = Object.keys(query).filter((key) => !allowedKeys.has(key))
  if (unknown.length) throw new BadRequestException(`不支持的查询参数：${unknown.sort().join('、')}`)

  const q = optionalString(query.q, '搜索词')
  if (q && q.length > 50) throw new BadRequestException('搜索词不能超过 50 个字符')
  if (q && /[\u0000-\u001f\u007f]/u.test(q)) throw new BadRequestException('搜索词包含无效控制字符')

  const campus = optionalEnum(query.campus, listingCampuses, '校区')
  const category = optionalEnum(query.category, listingCategories, '分类')
  const condition = optionalEnum(query.condition, listingConditions, '成色')
  const minPriceCents = optionalInteger(query.minPriceCents, '最低价格', 0, 10_000_000)
  const maxPriceCents = optionalInteger(query.maxPriceCents, '最高价格', 0, 10_000_000)
  if (minPriceCents !== undefined && maxPriceCents !== undefined && minPriceCents > maxPriceCents) {
    throw new BadRequestException('最低价格不能高于最高价格')
  }

  const sortAliases: Record<string, ListingSort> = {
    newest: 'newest', price_asc: 'price_asc', price_desc: 'price_desc',
    最新发布: 'newest', 价格从低到高: 'price_asc', 价格从高到低: 'price_desc'
  }
  const sortValue = optionalString(query.sort, '排序方式') || 'newest'
  const sort = sortAliases[sortValue]
  if (!sort) throw new BadRequestException('排序方式无效')

  const cursor = optionalString(query.cursor, '分页游标')
  if (cursor && (cursor.length > 100 || !/^[A-Za-z0-9_-]+$/.test(cursor))) throw new BadRequestException('分页游标格式无效')
  const limit = optionalInteger(query.limit, '每页数量', 1, 50) ?? 20
  const mine = allowMine && (query.mine === true || query.mine === 'true')

  return {
    ...(q ? { q } : {}), ...(campus ? { campus } : {}), ...(category ? { category } : {}),
    ...(condition ? { condition } : {}), ...(minPriceCents !== undefined ? { minPriceCents } : {}),
    ...(maxPriceCents !== undefined ? { maxPriceCents } : {}), sort,
    ...(cursor ? { cursor } : {}), limit, mine
  }
}
