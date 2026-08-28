import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common'
import { ListingStatus, Prisma } from '@prisma/client'
import { PrismaService } from '../../infra/prisma.service.js'

export const allowedTransitions: Record<ListingStatus, ListingStatus[]> = {
  DRAFT: ['PENDING_REVIEW'], PENDING_REVIEW: ['ACTIVE', 'OFF_SHELF', 'BLOCKED'], ACTIVE: ['RESERVED', 'SOLD', 'OFF_SHELF', 'BLOCKED'], RESERVED: ['ACTIVE', 'SOLD', 'OFF_SHELF', 'BLOCKED'], SOLD: [], OFF_SHELF: ['PENDING_REVIEW'], BLOCKED: []
}
@Injectable()
export class ListingsService {
  constructor(private readonly prisma: PrismaService) {}
  list(query: { q?: string; campus?: string; category?: string; cursor?: string; limit?: string; mine?: string }, userId?: string) {
    const take = Math.min(Math.max(Number(query.limit) || 20, 1), 50)
    const where: Prisma.ListingWhereInput = { deletedAt: null, ...(query.mine === 'true' && userId ? { sellerId: userId } : { status: 'ACTIVE' }), ...(query.campus ? { campus: query.campus } : {}), ...(query.category ? { category: query.category } : {}), ...(query.q ? { OR: ['title', 'author', 'isbn', 'course'].map((field) => ({ [field]: { contains: query.q, mode: 'insensitive' } })) } : {}) }
    return this.prisma.listing.findMany({ where, take: take + 1, ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}), orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], include: { images: { where: { uploadedAt: { not: null } }, orderBy: { sortOrder: 'asc' } }, seller: { select: { id: true, nickname: true, avatarUrl: true, campusStatus: true } } } }).then((items) => ({ items: items.slice(0, take), nextCursor: items.length > take ? items[take - 1].id : null }))
  }
  async get(id: string) { const item = await this.prisma.listing.findFirst({ where: { id, deletedAt: null }, include: { images: true, seller: { select: { id: true, nickname: true, avatarUrl: true, campus: true, campusStatus: true } } } }); if (!item) throw new NotFoundException('商品不存在'); return item }
  create(userId: string, body: any) {
    if (!body.title?.trim() || !Number.isInteger(body.priceCents) || body.priceCents <= 0) throw new BadRequestException('标题和价格不合法')
    return this.prisma.listing.create({ data: { sellerId: userId, title: body.title.trim().slice(0, 100), author: String(body.author || '').trim().slice(0, 80), isbn: String(body.isbn || '').replace(/[^0-9Xx]/g, '').slice(0, 13), category: String(body.category || '其他').slice(0, 30), course: String(body.course || '').slice(0, 60), condition: String(body.condition || '八成新').slice(0, 20), priceCents: body.priceCents, originalPriceCents: body.originalPriceCents || null, campus: String(body.campus || '').slice(0, 20), description: String(body.description || '').slice(0, 1000), tags: Array.isArray(body.tags) ? body.tags.slice(0, 8).map((x: unknown) => String(x).slice(0, 20)) : [], status: body.draft ? 'DRAFT' : 'PENDING_REVIEW', images: body.imageIds?.length ? { connect: body.imageIds.slice(0, 6).map((id: string) => ({ id })) } : undefined } })
  }
  async update(userId: string, id: string, body: any) { const item = await this.get(id); if (item.sellerId !== userId) throw new ForbiddenException('不能修改他人的商品'); return this.prisma.listing.update({ where: { id }, data: { title: body.title?.trim(), description: body.description?.slice(0, 1000), priceCents: body.priceCents, campus: body.campus, version: { increment: 1 } } }) }
  async state(userId: string, id: string, status: ListingStatus, version: number) { const item = await this.get(id); if (item.sellerId !== userId) throw new ForbiddenException('不能修改他人的商品'); if (!allowedTransitions[item.status].includes(status)) throw new BadRequestException(`不允许从 ${item.status} 变更为 ${status}`); const result = await this.prisma.listing.updateMany({ where: { id, version }, data: { status, version: { increment: 1 } } }); if (!result.count) throw new BadRequestException('商品已被其他请求更新，请刷新后重试'); return this.get(id) }
  async favorite(userId: string, id: string, enabled: boolean) { const item = await this.get(id); if (item.sellerId === userId) throw new BadRequestException('不能收藏自己的商品'); if (enabled) await this.prisma.favorite.upsert({ where: { userId_listingId: { userId, listingId: id } }, create: { userId, listingId: id }, update: {} }); else await this.prisma.favorite.deleteMany({ where: { userId, listingId: id } }); return { favorited: enabled } }
  favorites(userId: string) { return this.prisma.favorite.findMany({ where: { userId }, orderBy: { createdAt: 'desc' }, include: { listing: { include: { images: true } } } }).then((rows) => rows.map((row) => row.listing)) }
}
