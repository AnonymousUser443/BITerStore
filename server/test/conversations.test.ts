import { describe, expect, it, vi } from 'vitest'
import { ConversationsService } from '../src/modules/conversations/conversations.service.js'

describe('conversation responses', () => {
  it('serializes message and read cursor BigInts in the conversation list', async () => {
    const findMany = vi.fn().mockResolvedValue([{
      id: 'conversation-1',
      listingId: 'listing-1',
      buyerId: 'buyer-1',
      sellerId: 'seller-1',
      lastMessageAt: new Date('2026-08-29T00:00:00.000Z'),
      createdAt: new Date('2026-08-29T00:00:00.000Z'),
      listing: { id: 'listing-1', title: '测试商品', status: 'ACTIVE', deletedAt: null, images: [{ id: 'cover-1' }] },
      members: [{ conversationId: 'conversation-1', userId: 'buyer-1', lastReadMessageId: 7n, user: { id: 'buyer-1' } }],
      messages: [
        { id: 12n, conversationId: 'conversation-1', senderId: 'seller-1', content: '还在吗？', createdAt: new Date('2026-08-29T00:01:00.000Z') }
      ]
    }])
    const blockFindMany = vi.fn().mockResolvedValue([{ userId: 'seller-1', blockedUserId: 'buyer-1' }])
    const service = new ConversationsService({ conversation: { findMany }, block: { findMany: blockFindMany }, $queryRaw: vi.fn().mockResolvedValue([{ conversationId: 'conversation-1', unread: 1n }]) } as never, {} as never)

    const result = await service.list('buyer-1')

    expect(result.items[0].members[0].lastReadMessageId).toBe('7')
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ include: expect.objectContaining({ messages: { orderBy: { id: 'desc' }, take: 1 } }) }))
    expect(result.items[0].messages).toMatchObject([{ id: '12', content: '还在吗？' }])
    expect(result.items[0].listing.images[0].url).toContain('/api/v1/media/cover-1')
    expect(result.items[0].blocked).toBe(true)
    expect(result.items[0].unread).toBe(1)
    expect(result.nextCursor).toBeNull()
    expect(() => JSON.stringify(result)).not.toThrow()
  })

  it('returns the latest message page in chronological order', async () => {
    const findMany = vi.fn().mockResolvedValue([
      { id: 12n, conversationId: 'conversation-1', senderId: 'seller-1', content: '第二条', createdAt: new Date('2026-08-29T00:01:00.000Z') },
      { id: 11n, conversationId: 'conversation-1', senderId: 'buyer-1', content: '第一条', createdAt: new Date('2026-08-29T00:00:00.000Z') }
    ])
    const service = new ConversationsService({ conversationMember: { findUnique: vi.fn().mockResolvedValue({ conversation: { buyerId: 'buyer-1', sellerId: 'seller-1' } }) }, message: { findMany }, block: { count: vi.fn().mockResolvedValue(0) } } as never, {} as never)

    const result = await service.messages('buyer-1', 'conversation-1')

    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ orderBy: { id: 'desc' }, take: 31 }))
    expect(result.items.map((message) => message.id)).toEqual(['11', '12'])
    expect(result.nextCursor).toBe('12')
    expect(result.blocked).toBe(false)
  })

  it('blocks conversation creation and sending in either block direction', async () => {
    const prisma = {
      listing: { findFirst: vi.fn().mockResolvedValue({ id: 'listing-1', sellerId: 'seller-1' }) },
      conversation: { upsert: vi.fn() },
      conversationMember: { findUnique: vi.fn().mockResolvedValue({ conversation: { buyerId: 'buyer-1', sellerId: 'seller-1' } }) },
      block: { count: vi.fn().mockResolvedValue(1) },
      $transaction: vi.fn()
    }
    const service = new ConversationsService(prisma as never, {} as never)
    await expect(service.create('buyer-1', 'listing-1')).rejects.toMatchObject({ status: 403 })
    await expect(service.send('buyer-1', 'conversation-1', '你好')).rejects.toMatchObject({ status: 403 })
    expect(prisma.conversation.upsert).not.toHaveBeenCalled()
    expect(prisma.$transaction).not.toHaveBeenCalled()
  })

  it('rejects invalid message cursors as a client error', async () => {
    const prisma = {
      conversationMember: { findUnique: vi.fn().mockResolvedValue({ conversation: { buyerId: 'buyer-1', sellerId: 'seller-1' } }) },
      message: { findMany: vi.fn() }, block: { count: vi.fn().mockResolvedValue(0) }
    }
    await expect(new ConversationsService(prisma as never, {} as never).messages('buyer-1', 'conversation-1', 'not-a-number')).rejects.toMatchObject({ status: 400 })
    expect(prisma.message.findMany).not.toHaveBeenCalled()
  })

  it('rate limits message sends before creating a database row', async () => {
    const prisma = {
      conversationMember: { findUnique: vi.fn().mockResolvedValue({ conversation: { buyerId: 'buyer-1', sellerId: 'seller-1' } }) },
      block: { count: vi.fn().mockResolvedValue(0) },
      $transaction: vi.fn()
    }
    const redis = {
      ensureConnected: vi.fn().mockResolvedValue(undefined),
      client: { eval: vi.fn().mockResolvedValue([31, 31]) }
    }
    const service = new ConversationsService(prisma as never, redis as never)

    await expect(service.send('buyer-1', 'conversation-1', '你好')).rejects.toMatchObject({ status: 429 })
    expect(prisma.$transaction).not.toHaveBeenCalled()
  })
})
