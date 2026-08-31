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
      listing: { id: 'listing-1', title: '测试商品', status: 'ACTIVE', images: [{ id: 'cover-1' }] },
      members: [{ conversationId: 'conversation-1', userId: 'buyer-1', lastReadMessageId: 7n, user: { id: 'buyer-1' } }],
      messages: [{ id: 12n, conversationId: 'conversation-1', senderId: 'seller-1', content: '还在吗？', createdAt: new Date('2026-08-29T00:00:00.000Z') }]
    }])
    const service = new ConversationsService({ conversation: { findMany } } as never, {} as never)

    const result = await service.list('buyer-1')

    expect(result[0].members[0].lastReadMessageId).toBe('7')
    expect(result[0].messages[0].id).toBe('12')
    expect(result[0].listing.images[0].url).toContain('/api/v1/media/cover-1')
    expect(() => JSON.stringify(result)).not.toThrow()
  })
})
