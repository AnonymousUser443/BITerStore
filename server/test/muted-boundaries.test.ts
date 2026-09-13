import { describe, expect, it } from 'vitest'
import { ExecutionContext, ForbiddenException } from '@nestjs/common'
import { NotMutedGuard, VerifiedGuard } from '../src/common/auth.js'
import { ConversationsController } from '../src/modules/conversations/conversations.controller.js'
import { ListingsController } from '../src/modules/listings/listings.controller.js'
import { ModerationController } from '../src/modules/moderation/moderation.controller.js'

const context = (user: unknown) => ({ switchToHttp: () => ({ getRequest: () => ({ user }) }) }) as unknown as ExecutionContext

describe('MUTED server boundaries', () => {
  it('rejects muted users from verified interactions', () => {
    const user = { id: 'muted-1', role: 'USER', campusStatus: 'VERIFIED', status: 'MUTED' }
    expect(() => new VerifiedGuard().canActivate(context(user))).toThrow(ForbiddenException)
    expect(() => new NotMutedGuard().canActivate(context(user))).toThrow(ForbiddenException)
  })

  it('allows active verified users through the same guards', () => {
    const user = { id: 'active-1', role: 'USER', campusStatus: 'VERIFIED', status: 'ACTIVE' }
    expect(new VerifiedGuard().canActivate(context(user))).toBe(true)
    expect(new NotMutedGuard().canActivate(context(user))).toBe(true)
  })

  it('keeps controller methods fail-closed even when called outside Nest guards', async () => {
    const muted = { id: 'muted-1', role: 'USER' as const, campusStatus: 'VERIFIED', status: 'MUTED' as const }
    const conversations = new ConversationsController({ create: () => { throw new Error('must not run') }, send: () => { throw new Error('must not run') } } as any)
    await expect(Promise.resolve().then(() => conversations.create(muted, { listingId: 'listing-1' }))).rejects.toBeInstanceOf(ForbiddenException)
    await expect(Promise.resolve().then(() => conversations.send(muted, 'conversation-1', { content: 'hello' }))).rejects.toBeInstanceOf(ForbiddenException)
    const listings = new ListingsController({ create: () => { throw new Error('must not run') } } as any)
    expect(() => listings.create(muted, {})).toThrow(ForbiddenException)
    const moderation = new ModerationController({} as any)
    await expect(moderation.report(muted, { targetType: 'LISTING', targetId: 'listing-1', reason: 'spam' })).rejects.toBeInstanceOf(ForbiddenException)
  })
})
