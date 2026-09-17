import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException, Optional } from '@nestjs/common'
import { ListingStatus, Prisma } from '@prisma/client'
import { CatalogCacheService } from '../../infra/catalog-cache.service.js'
import { PrismaService } from '../../infra/prisma.service.js'
import { type ListingQueryInput, type NormalizedListingQuery, normalizeListingQuery } from './listing-query.js'
import { type CreateListingInput, normalizeCreateListing, normalizeListingStatus, normalizeUpdateListing } from './listing-write.js'

export const allowedTransitions: Record<ListingStatus, ListingStatus[]> = {
  DRAFT: ['PENDING_REVIEW'], PENDING_REVIEW: ['OFF_SHELF'], ACTIVE: ['RESERVED', 'SOLD', 'OFF_SHELF', 'BLOCKED'], RESERVED: ['ACTIVE', 'SOLD', 'OFF_SHELF', 'BLOCKED'], SOLD: [], OFF_SHELF: ['ACTIVE', 'PENDING_REVIEW'], BLOCKED: []
}
@Injectable()
export class ListingsService {
  constructor(private readonly prisma: PrismaService, @Optional() private readonly catalogCache?: CatalogCacheService) {}
  private present<T extends { images?: Array<{ id: string; mime?: string; width?: number | null; height?: number | null; role?: string; sortOrder?: number }> }>(item: T, ownerView = false) {
    const publicBase = `${(process.env.PUBLIC_API_URL || `http://localhost:${process.env.PORT || 3100}`).replace(/\/$/, '')}/api/v1/media`
    const {
      clientRequestId: _clientRequestId,
      deletedAt: _deletedAt,
      moderationDecision: _moderationDecision,
      moderatedAt: _moderatedAt,
      images,
      ...safe
    } = item as T & { clientRequestId?: string | null; deletedAt?: Date | null; moderationDecision?: string | null; moderatedAt?: Date | null }
    return {
      ...safe,
      images: images?.map((image) => ({
        id: image.id,
        ...(image.mime ? { mime: image.mime } : {}),
        ...(image.width ? { width: image.width } : {}),
        ...(image.height ? { height: image.height } : {}),
        ...(image.role ? { role: image.role } : {}),
        ...(image.sortOrder !== undefined ? { sortOrder: image.sortOrder } : {}),
        url: `${publicBase}/${ownerView ? 'owner/' : ''}${encodeURIComponent(image.id)}`
      }))
    }
  }
  private include(ownerView = false) {
    return {
      images: { where: { uploadedAt: { not: null }, role: { not: 'ISBN' as const }, ...(!ownerView ? { moderationStatus: 'APPROVED' as const } : {}) }, orderBy: { sortOrder: 'asc' as const } },
      seller: { select: { id: true, nickname: true, avatarUrl: true, campus: true, campusStatus: true, bio: true } }
    }
  }
  private publicVisibility(): Prisma.ListingWhereInput {
    return {
      status: 'ACTIVE',
      seller: { status: 'ACTIVE' },
      AND: [
        { images: { some: { uploadedAt: { not: null }, role: 'COVER', moderationStatus: 'APPROVED' } } },
        { images: { some: { uploadedAt: { not: null }, role: 'ISBN' } } }
      ]
    }
  }

  async list(query: ListingQueryInput, userId?: string) {
    const normalized = normalizeListingQuery(query, Boolean(userId))
    const load = () => this.queryList(normalized, userId)
    if (normalized.mine || !this.catalogCache) return load()
    return this.catalogCache.publicList(normalized, load)
  }

  private queryList(query: NormalizedListingQuery, userId?: string) {
    const mine = query.mine && userId
    const price = query.minPriceCents !== undefined || query.maxPriceCents !== undefined
      ? { ...(query.minPriceCents !== undefined ? { gte: query.minPriceCents } : {}), ...(query.maxPriceCents !== undefined ? { lte: query.maxPriceCents } : {}) }
      : undefined
    const where: Prisma.ListingWhereInput = {
      deletedAt: null,
      ...(mine ? { sellerId: userId } : this.publicVisibility()),
      ...(query.campus ? { campus: query.campus } : {}),
      ...(query.category ? { category: query.category } : {}),
      ...(query.condition ? { condition: query.condition } : {}),
      ...(price ? { priceCents: price } : {}),
      ...(query.q ? { OR: ['title', 'author', 'isbn', 'course'].map((field) => ({ [field]: { contains: query.q, mode: 'insensitive' } })) } : {})
    }
    const orderBy: Prisma.ListingOrderByWithRelationInput[] = query.sort === 'price_asc'
      ? [{ priceCents: 'asc' }, { id: 'asc' }]
      : query.sort === 'price_desc'
        ? [{ priceCents: 'desc' }, { id: 'desc' }]
        : [{ createdAt: 'desc' }, { id: 'desc' }]
    return this.prisma.listing.findMany({ where, take: query.limit + 1, ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}), orderBy, include: this.include(Boolean(mine)) })
      .then((items) => ({ items: items.slice(0, query.limit).map((item) => this.present(item, Boolean(mine))), nextCursor: items.length > query.limit ? items[query.limit - 1].id : null }))
  }
  private async getInternal(id: string, publicOnly: boolean) {
    const item = await this.prisma.listing.findFirst({
      where: { id, deletedAt: null, ...(publicOnly ? this.publicVisibility() : {}) },
      include: this.include(!publicOnly)
    })
    if (!item) throw new NotFoundException('商品不存在')
    return this.present(item, !publicOnly)
  }
  async get(id: string) {
    if (!id || id.length > 100 || !/^[A-Za-z0-9_-]+$/.test(id)) throw new BadRequestException('商品 ID 格式无效')
    const load = () => this.getInternal(id, true)
    return this.catalogCache ? this.catalogCache.publicDetail(id, load) : load()
  }
  private async getForOwner(id: string) { return this.getInternal(id, false) }
  async getMine(userId: string, id: string) {
    const item = await this.getForOwner(id)
    if (item.sellerId !== userId) throw new ForbiddenException('不能查看他人的商品')
    return item
  }
  async countMine(userId: string) {
    return { count: await this.prisma.listing.count({ where: { sellerId: userId, deletedAt: null } }) }
  }
  async create(userId: string, body: unknown) {
    const input: CreateListingInput = normalizeCreateListing(body)
    const clientRequestId = input.clientRequestId
    if (clientRequestId) {
      const existing = await this.prisma.listing.findFirst({ where: { sellerId: userId, clientRequestId } })
      if (existing) return existing
    }
    const imageIds = input.imageIds
    try {
      const created = await this.prisma.$transaction(async (tx) => {
        const images = imageIds.length ? await tx.listingImage.findMany({ where: { id: { in: imageIds }, ownerId: userId, uploadedAt: { not: null }, listingId: null } }) : []
        if (images.length !== imageIds.length) throw new BadRequestException('图片不存在、尚未上传完成或不属于当前用户')
        if (!input.draft && (!images.some((image) => image.role === 'COVER') || !images.some((image) => image.role === 'ISBN'))) throw new BadRequestException('发布前必须上传封面和 ISBN 页')
        const listing = await tx.listing.create({ data: { sellerId: userId, clientRequestId, title: input.title, author: input.author, isbn: input.isbn, category: input.category, course: input.course, condition: input.condition, priceCents: input.priceCents, originalPriceCents: input.originalPriceCents, campus: input.campus, description: input.description, tags: input.tags, status: input.draft ? 'DRAFT' : 'PENDING_REVIEW' } })
        if (imageIds.length) {
          const bound = await tx.listingImage.updateMany({ where: { id: { in: imageIds }, ownerId: userId, uploadedAt: { not: null }, listingId: null }, data: { listingId: listing.id } })
          if (bound.count !== imageIds.length) throw new ConflictException('图片已被其他商品绑定，请重新选择图片')
        }
        return listing
      })
      await this.catalogCache?.invalidate()
      return created
    } catch (cause) {
      if (clientRequestId && (cause as { code?: string }).code === 'P2002') {
        const existing = await this.prisma.listing.findFirst({ where: { sellerId: userId, clientRequestId } })
        if (existing) return existing
      }
      throw cause
    }
  }
  async update(userId: string, id: string, body: unknown) {
    const input = normalizeUpdateListing(body)
    const item = await this.getForOwner(id)
    if (item.sellerId !== userId) throw new ForbiddenException('不能修改他人的商品')
    if (item.status === 'SOLD' || item.status === 'BLOCKED') throw new BadRequestException('当前商品状态不允许修改')
    const { version, ...data } = input
    const requiresReview = item.status !== 'DRAFT'
    const result = await this.prisma.listing.updateMany({
      where: { id, version, deletedAt: null },
      data: {
        ...data,
        ...(requiresReview ? { status: 'PENDING_REVIEW' as const, moderationDecision: null, moderatedAt: null } : {}),
        version: { increment: 1 }
      }
    })
    if (!result.count) throw new ConflictException('商品已被其他请求更新，请刷新后重试')
    await this.catalogCache?.invalidate()
    return this.getForOwner(id)
  }
  async remove(userId: string, id: string) {
    const item = await this.prisma.listing.findFirst({ where: { id, deletedAt: null } })
    if (!item) throw new NotFoundException('商品不存在')
    if (item.sellerId !== userId) throw new ForbiddenException('不能删除他人的商品')
    await this.prisma.listing.update({ where: { id }, data: { deletedAt: new Date(), status: 'OFF_SHELF', version: { increment: 1 } } })
    await this.catalogCache?.invalidate()
    return { deleted: true }
  }
  async state(userId: string, id: string, body: unknown) {
    const normalized = normalizeListingStatus(body)
    // Keep the internal moderation marker here; owner/public DTOs omit it.
    const item = await this.prisma.listing.findFirst({ where: { id, deletedAt: null } })
    if (!item) throw new NotFoundException('商品不存在')
    if (item.sellerId !== userId) throw new ForbiddenException('不能修改他人的商品')
    if (!allowedTransitions[item.status].includes(normalized.status)) throw new BadRequestException(`不允许从 ${item.status} 变更为 ${normalized.status}`)
    // Every content edit clears this approval in the same versioned update.
    // A relist request for changed/unapproved content becomes a resubmission.
    const nextStatus = normalized.status === 'ACTIVE' && item.moderationDecision !== 'ACTIVE'
      ? 'PENDING_REVIEW' : normalized.status
    if (nextStatus === 'PENDING_REVIEW' || nextStatus === 'ACTIVE') {
      const images = await this.prisma.listingImage.findMany({
        where: { listingId: id, uploadedAt: { not: null } },
        select: { role: true, moderationStatus: true }
      })
      if (!images.some((image) => image.role === 'COVER') || !images.some((image) => image.role === 'ISBN')) {
        throw new BadRequestException('提交审核或上架前必须上传封面和 ISBN 页')
      }
      if (nextStatus === 'ACTIVE' && images.some((image) => image.role !== 'ISBN' && image.moderationStatus !== 'APPROVED')) {
        throw new BadRequestException('商品图片尚未审核通过，不能上架')
      }
    }
    const result = await this.prisma.listing.updateMany({
      where: { id, sellerId: userId, version: normalized.version, deletedAt: null, ...(nextStatus === 'ACTIVE' ? { moderationDecision: 'ACTIVE' } : {}) },
      data: {
        status: nextStatus,
        ...(nextStatus === 'PENDING_REVIEW' ? { moderationDecision: null, moderatedAt: null } : {}),
        version: { increment: 1 }
      }
    })
    if (!result.count) throw new ConflictException('商品已被其他请求更新，请刷新后重试')
    await this.catalogCache?.invalidate()
    return this.getForOwner(id)
  }
  async favorite(userId: string, id: string, enabled: boolean) {
    const item = await this.get(id)
    if (item.sellerId === userId) throw new BadRequestException('不能收藏自己的商品')
    if (enabled) {
      await this.prisma.$transaction(async (tx) => {
        const created = await tx.favorite.createMany({ data: [{ userId, listingId: id }], skipDuplicates: true })
        if (created.count) await tx.notification.create({ data: { userId: item.sellerId, type: 'like', title: '商品被收藏', body: `有同学收藏了《${item.title}》`.slice(0, 200) } })
      })
    } else await this.prisma.favorite.deleteMany({ where: { userId, listingId: id } })
    return { favorited: enabled }
  }
  favorites(userId: string) { return this.prisma.favorite.findMany({ where: { userId, listing: { deletedAt: null, ...this.publicVisibility() } }, orderBy: { createdAt: 'desc' }, include: { listing: { include: this.include() } } }).then((rows) => rows.map((row) => this.present(row.listing))) }
}
