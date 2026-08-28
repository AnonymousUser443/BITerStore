import { describe, expect, it } from 'vitest'
import { allowedTransitions } from '../src/modules/listings/listings.service.js'

describe('listing state machine', () => {
  it('allows the normal review and sale path', () => {
    expect(allowedTransitions.DRAFT).toContain('PENDING_REVIEW')
    expect(allowedTransitions.PENDING_REVIEW).toContain('ACTIVE')
    expect(allowedTransitions.ACTIVE).toContain('RESERVED')
    expect(allowedTransitions.RESERVED).toContain('SOLD')
  })
  it('does not reopen sold or blocked listings', () => {
    expect(allowedTransitions.SOLD).toEqual([])
    expect(allowedTransitions.BLOCKED).toEqual([])
  })
})
