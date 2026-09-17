import { BadRequestException, ForbiddenException, HttpException, HttpStatus, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { PrismaService } from '../../infra/prisma.service.js'
import { RedisService } from '../../infra/redis.service.js'
@Injectable()
export class ConversationsService {
  constructor(private readonly prisma: PrismaService, private readonly redis: RedisService) {}
  async list(userId: string, cursor?: string, limitRaw?: string) {
    if (cursor && (cursor.length > 100 || !/^[A-Za-z0-9_-]+$/.test(cursor))) throw new BadRequestException('会话游标无效')
    const limit = this.limit(limitRaw, 20, 50)
    const conversations = await this.prisma.conversation.findMany({
      where: { members: { some: { userId } } },
      orderBy: [{ lastMessageAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      include: {
        listing: { select: { id: true, title: true, author: true, isbn: true, category: true, course: true, priceCents: true, originalPriceCents: true, condition: true, campus: true, description: true, status: true, sellerId: true, createdAt: true, deletedAt: true, tags: true, images: { where: { uploadedAt: { not: null }, role: { not: 'ISBN' }, moderationStatus: 'APPROVED' }, orderBy: { sortOrder: 'asc' }, select: { id: true } } } },
        members: { include: { user: { select: { id: true, nickname: true, avatarUrl: true, campus: true, campusStatus: true, bio: true } } } },
        messages: { orderBy: { id: 'desc' }, take: 1 }
      }
    })
    const page = conversations.slice(0, limit)
    const otherUserIds = [...new Set(page.map((conversation) => conversation.buyerId === userId ? conversation.sellerId : conversation.buyerId))]
    const blockedUsers = await this.blockedUsers(userId, otherUserIds)
    const unreadCounts = await this.unreadCounts(userId, page.map((conversation) => conversation.id))
    const items = page.map((conversation) => ({
      ...conversation,
      blocked: blockedUsers.has(conversation.buyerId === userId ? conversation.sellerId : conversation.buyerId),
      unread: unreadCounts.get(conversation.id) || 0,
      listing: { ...conversation.listing, status: conversation.listing.deletedAt ? 'OFF_SHELF' : conversation.listing.status, images: conversation.listing.images.map((image) => ({ ...image, url: `${(process.env.PUBLIC_API_URL || `http://localhost:${process.env.PORT || 3100}`).replace(/\/$/, '')}/api/v1/media/${encodeURIComponent(image.id)}` })) },
      members: conversation.members.map((member) => ({ ...member, lastReadMessageId: member.lastReadMessageId?.toString() ?? null })),
      messages: [...conversation.messages].reverse().map((message) => ({ ...message, id: message.id.toString() }))
    }))
    return { items, nextCursor: conversations.length > limit ? page.at(-1)?.id || null : null }
  }
  async create(userId: string, listingId: string) {
    if (!listingId || listingId.length > 100 || !/^[A-Za-z0-9_-]+$/.test(listingId)) throw new BadRequestException('商品标识无效')
    const listing = await this.prisma.listing.findFirst({ where: { id: listingId, status: { in: ['ACTIVE', 'RESERVED'] }, deletedAt: null } })
    if (!listing) throw new NotFoundException('商品不存在或不可联系')
    if (listing.sellerId === userId) throw new BadRequestException('不能联系自己')
    if (await this.isBlocked(userId, listing.sellerId)) throw new ForbiddenException('你与该用户之间已设置拉黑，无法发起会话')
    return this.prisma.conversation.upsert({ where: { listingId_buyerId_sellerId: { listingId, buyerId: userId, sellerId: listing.sellerId } }, create: { listingId, buyerId: userId, sellerId: listing.sellerId, members: { create: [{ userId }, { userId: listing.sellerId }] } }, update: {} })
  }
  private async access(userId: string, id: string) {
    const member = await this.prisma.conversationMember.findUnique({
      where: { conversationId_userId: { conversationId: id, userId } },
      include: { conversation: { select: { buyerId: true, sellerId: true } } }
    })
    if (!member) throw new ForbiddenException('无权访问该会话')
    const otherUserId = member.conversation.buyerId === userId ? member.conversation.sellerId : member.conversation.buyerId
    return { member, otherUserId, blocked: await this.isBlocked(userId, otherUserId) }
  }
  async messages(userId: string, id: string, after?: string, before?: string, limitRaw?: string) {
    const access = await this.access(userId, id)
    if (after && before) throw new BadRequestException('不能同时使用向前和向后游标')
    const limit = this.limit(limitRaw, 30, 100)
    let afterId: bigint | undefined
    let beforeId: bigint | undefined
    if (after) {
      try { afterId = BigInt(after) } catch { throw new BadRequestException('消息游标无效') }
      if (afterId < 0n) throw new BadRequestException('消息游标无效')
    }
    if (before) {
      try { beforeId = BigInt(before) } catch { throw new BadRequestException('消息游标无效') }
      if (beforeId < 0n) throw new BadRequestException('消息游标无效')
    }
    const rows = await this.prisma.message.findMany({
      where: { conversationId: id, ...(afterId !== undefined ? { id: { gt: afterId } } : beforeId !== undefined ? { id: { lt: beforeId } } : {}) },
      orderBy: { id: after ? 'asc' : 'desc' }, take: limit + 1
    })
    const hasMore = rows.length > limit
    const selected = rows.slice(0, limit)
    const ordered = after ? selected : [...selected].reverse()
    return {
      items: ordered.map((item) => ({ ...item, id: item.id.toString() })),
      nextCursor: ordered.at(-1)?.id.toString() || after || null,
      olderCursor: !after && hasMore ? ordered[0]?.id.toString() || null : null,
      blocked: access.blocked
    }
  }
  async send(userId: string, id: string, content: string) {
    const access = await this.access(userId, id)
    if (access.blocked) throw new ForbiddenException('你与该用户之间已设置拉黑，无法继续发送消息')
    if (typeof content !== 'string') throw new BadRequestException('消息内容格式无效')
    const normalized = content.trim()
    if (!normalized || normalized.length > 1000) throw new BadRequestException('消息长度应为 1–1000 个字符')
    await this.enforceSendRate(userId, id)
    const message = await this.prisma.$transaction(async (tx) => {
      const created = await tx.message.create({ data: { conversationId: id, senderId: userId, content: normalized } })
      await tx.conversation.update({ where: { id }, data: { lastMessageAt: created.createdAt } })
      await tx.notification.create({ data: { userId: access.otherUserId, type: 'comment', title: '新的私聊消息', body: normalized.slice(0, 120) } })
      return created
    })
    try { await this.redis.ensureConnected(); const members = await this.prisma.conversationMember.findMany({ where: { conversationId: id, userId: { not: userId } } }); await Promise.all(members.map((member) => this.redis.client.incr(`unread:${member.userId}:${id}`))) } catch { /* PostgreSQL remains the source of truth */ }
    return { ...message, id: message.id.toString() }
  }
  async read(userId: string, id: string, messageId: string) {
    const access = await this.access(userId, id)
    let parsed: bigint
    try { parsed = BigInt(messageId) } catch { throw new BadRequestException('消息标识无效') }
    if (parsed < 0n) throw new BadRequestException('消息标识无效')
    const target = await this.prisma.message.findFirst({ where: { id: parsed, conversationId: id }, select: { id: true } })
    if (!target) throw new BadRequestException('消息不属于该会话')
    const currentRead = access.member.lastReadMessageId || 0n
    if (parsed > currentRead) await this.prisma.conversationMember.update({ where: { conversationId_userId: { conversationId: id, userId } }, data: { lastReadMessageId: parsed } })
    try { await this.redis.ensureConnected(); await this.redis.client.del(`unread:${userId}:${id}`) } catch {}
    return { ok: true }
  }

  private async blockedUsers(userId: string, candidates: string[]) {
    if (!candidates.length) return new Set<string>()
    const rows = await this.prisma.block.findMany({
      where: { OR: [{ userId, blockedUserId: { in: candidates } }, { blockedUserId: userId, userId: { in: candidates } }] },
      select: { userId: true, blockedUserId: true }
    })
    return new Set(rows.map((row) => row.userId === userId ? row.blockedUserId : row.userId))
  }

  private async isBlocked(userId: string, otherUserId: string) {
    return (await this.prisma.block.count({ where: { OR: [{ userId, blockedUserId: otherUserId }, { userId: otherUserId, blockedUserId: userId }] } })) > 0
  }

  private limit(raw: string | undefined, fallback: number, maximum: number) {
    if (raw === undefined || raw === '') return fallback
    if (!/^\d+$/.test(raw)) throw new BadRequestException('分页数量无效')
    const value = Number(raw)
    if (!Number.isSafeInteger(value) || value < 1 || value > maximum) throw new BadRequestException(`分页数量应为 1–${maximum}`)
    return value
  }

  private configuredLimit(raw: string | undefined, fallback: number, maximum: number) {
    const value = Number(raw)
    return Number.isSafeInteger(value) && value > 0 ? Math.min(value, maximum) : fallback
  }

  private async enforceSendRate(userId: string, conversationId: string) {
    const userLimit = this.configuredLimit(process.env.CHAT_SEND_PER_MINUTE, 30, 300)
    const conversationLimit = this.configuredLimit(process.env.CHAT_CONVERSATION_SEND_PER_MINUTE, 60, 600)
    const window = Math.floor(Date.now() / 60_000)
    try {
      await this.redis.ensureConnected()
      const counts = await this.redis.client.eval(
        "local user = redis.call('INCR', KEYS[1]); local conversation = redis.call('INCR', KEYS[2]); if user == 1 then redis.call('EXPIRE', KEYS[1], 120); end; if conversation == 1 then redis.call('EXPIRE', KEYS[2], 120); end; return {user, conversation}",
        2,
        `ratelimit:chat:user:${userId}:${window}`,
        `ratelimit:chat:conversation:${conversationId}:${window}`
      ) as [number, number]
      if (Number(counts[0]) > userLimit || Number(counts[1]) > conversationLimit) {
        throw new HttpException('消息发送过于频繁，请稍后再试', HttpStatus.TOO_MANY_REQUESTS)
      }
    } catch (cause) {
      if (cause instanceof HttpException) throw cause
      if (process.env.NODE_ENV === 'production') throw new ServiceUnavailableException('消息配额服务暂时不可用，请稍后重试')
    }
  }

  private async unreadCounts(userId: string, conversationIds: string[]) {
    if (!conversationIds.length) return new Map<string, number>()
    const rows = await this.prisma.$queryRaw<Array<{ conversationId: string; unread: bigint }>>(Prisma.sql`
      SELECT member."conversationId", COUNT(message."id")::bigint AS "unread"
      FROM "ConversationMember" AS member
      JOIN "Message" AS message ON message."conversationId" = member."conversationId"
      WHERE member."userId" = ${userId}
        AND message."senderId" <> ${userId}
        AND message."id" > COALESCE(member."lastReadMessageId", 0)
        AND member."conversationId" IN (${Prisma.join(conversationIds)})
      GROUP BY member."conversationId"
    `)
    return new Map(rows.map((row) => [row.conversationId, Number(row.unread)]))
  }
}
