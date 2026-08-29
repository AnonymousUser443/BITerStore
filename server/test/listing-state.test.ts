import { describe, expect, it } from 'vitest'
import { allowedTransitions } from '../src/modules/listings/listings.service.js'

describe('listing state machine', () => {
  it('allows verified sellers to publish and relist directly', () => {
    expect(allowedTransitions.DRAFT).toContain('ACTIVE')
    expect(allowedTransitions.PENDING_REVIEW).toContain('ACTIVE')
    expect(allowedTransitions.OFF_SHELF).toContain('ACTIVE')
    expect(allowedTransitions.ACTIVE).toContain('RESERVED')
    expect(allowedTransitions.RESERVED).toContain('SOLD')
  })
  it('does not reopen sold or blocked listings', () => {
    expect(allowedTransitions.SOLD).toEqual([])
    expect(allowedTransitions.BLOCKED).toEqual([])
  })
})
