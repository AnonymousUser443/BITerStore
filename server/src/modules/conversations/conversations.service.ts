import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../../infra/prisma.service.js'
import { RedisService } from '../../infra/redis.service.js'
@Injectable()
export class ConversationsService {
  constructor(private readonly prisma: PrismaService, private readonly redis: RedisService) {}
  async list(userId: string) {
    const conversations = await this.prisma.conversation.findMany({
      where: { members: { some: { userId } } },
      orderBy: { lastMessageAt: 'desc' },
      include: {
        listing: { select: { id: true, title: true, author: true, isbn: true, category: true, course: true, priceCents: true, originalPriceCents: true, condition: true, campus: true, description: true, status: true, sellerId: true, createdAt: true, deletedAt: true, tags: true, images: { where: { uploadedAt: { not: null }, role: { not: 'ISBN' } }, orderBy: { sortOrder: 'asc' }, select: { id: true } } } },
        members: { include: { user: { select: { id: true, nickname: true, avatarUrl: true, campus: true, campusStatus: true, bio: true } } } },
        messages: { orderBy: { id: 'desc' }, take: 50 }
      }
    })
    return conversations.map((conversation) => ({
      ...conversation,
      listing: { ...conversation.listing, status: conversation.listing.deletedAt ? 'OFF_SHELF' : conversation.listing.status, images: conversation.listing.images.map((image) => ({ ...image, url: `${(process.env.PUBLIC_API_URL || `http://localhost:${process.env.PORT || 3100}`).replace(/\/$/, '')}/api/v1/media/${encodeURIComponent(image.id)}` })) },
      members: conversation.members.map((member) => ({ ...member, lastReadMessageId: member.lastReadMessageId?.toString() ?? null })),
      messages: [...conversation.messages].reverse().map((message) => ({ ...message, id: message.id.toString() }))
    }))
  }
  async create(userId: string, listingId: string) { const listing = await this.prisma.listing.findFirst({ where: { id: listingId, status: { in: ['ACTIVE', 'RESERVED'] }, deletedAt: null } }); if (!listing) throw new NotFoundException('商品不存在或不可联系'); if (listing.sellerId === userId) throw new BadRequestException('不能联系自己'); return this.prisma.conversation.upsert({ where: { listingId_buyerId_sellerId: { listingId, buyerId: userId, sellerId: listing.sellerId } }, create: { listingId, buyerId: userId, sellerId: listing.sellerId, members: { create: [{ userId }, { userId: listing.sellerId }] } }, update: {} }) }
  private async assertMember(userId: string, id: string) { const member = await this.prisma.conversationMember.findUnique({ where: { conversationId_userId: { conversationId: id, userId } } }); if (!member) throw new ForbiddenException('无权访问该会话'); return member }
  async messages(userId: string, id: string, after?: string, limitRaw?: string) { await this.assertMember(userId, id); const limit = Math.min(Number(limitRaw) || 50, 100); const rows = await this.prisma.message.findMany({ where: { conversationId: id, ...(after ? { id: { gt: BigInt(after) } } : {}) }, orderBy: { id: after ? 'asc' : 'desc' }, take: limit }); const ordered = after ? rows : [...rows].reverse(); return { items: ordered.map((item) => ({ ...item, id: item.id.toString() })), nextCursor: ordered.at(-1)?.id.toString() || after || null } }
  async send(userId: string, id: string, content: string) { await this.assertMember(userId, id); const normalized = content.trim(); if (!normalized || normalized.length > 1000) throw new BadRequestException('消息长度应为 1–1000 个字符'); const message = await this.prisma.$transaction(async (tx) => { const created = await tx.message.create({ data: { conversationId: id, senderId: userId, content: normalized } }); await tx.conversation.update({ where: { id }, data: { lastMessageAt: created.createdAt } }); return created }); try { await this.redis.ensureConnected(); const members = await this.prisma.conversationMember.findMany({ where: { conversationId: id, userId: { not: userId } } }); await Promise.all(members.map((member) => this.redis.client.incr(`unread:${member.userId}:${id}`))) } catch { /* PostgreSQL remains the source of truth */ } return { ...message, id: message.id.toString() } }
  async read(userId: string, id: string, messageId: string) { await this.assertMember(userId, id); await this.prisma.conversationMember.update({ where: { conversationId_userId: { conversationId: id, userId } }, data: { lastReadMessageId: BigInt(messageId) } }); try { await this.redis.ensureConnected(); await this.redis.client.del(`unread:${userId}:${id}`) } catch {} return { ok: true } }
}
