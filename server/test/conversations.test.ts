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
        { id: 12n, conversationId: 'conversation-1', senderId: 'seller-1', content: '还在吗？', createdAt: new Date('2026-08-29T00:01:00.000Z') },
        { id: 11n, conversationId: 'conversation-1', senderId: 'buyer-1', content: '想咨询这本书', createdAt: new Date('2026-08-29T00:00:00.000Z') }
      ]
    }])
    const service = new ConversationsService({ conversation: { findMany } } as never, {} as never)

    const result = await service.list('buyer-1')

    expect(result[0].members[0].lastReadMessageId).toBe('7')
    expect(result[0].messages.map((message) => message.id)).toEqual(['11', '12'])
    expect(result[0].listing.images[0].url).toContain('/api/v1/media/cover-1')
    expect(() => JSON.stringify(result)).not.toThrow()
  })

  it('returns the latest message page in chronological order', async () => {
    const findMany = vi.fn().mockResolvedValue([
      { id: 12n, conversationId: 'conversation-1', senderId: 'seller-1', content: '第二条', createdAt: new Date('2026-08-29T00:01:00.000Z') },
      { id: 11n, conversationId: 'conversation-1', senderId: 'buyer-1', content: '第一条', createdAt: new Date('2026-08-29T00:00:00.000Z') }
    ])
    const service = new ConversationsService({ conversationMember: { findUnique: vi.fn().mockResolvedValue({}) }, message: { findMany } } as never, {} as never)

    const result = await service.messages('buyer-1', 'conversation-1')

    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ orderBy: { id: 'desc' }, take: 50 }))
    expect(result.items.map((message) => message.id)).toEqual(['11', '12'])
    expect(result.nextCursor).toBe('12')
  })
})
