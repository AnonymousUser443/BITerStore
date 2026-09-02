import { describe, expect, it } from 'vitest'
import { queryString, requestId } from './api'

describe('admin API helpers', () => {
  it('omits empty filters and safely encodes search values', () => {
    expect(queryString({ q: '高等 数学', status: '', page: 2 })).toBe('?q=%E9%AB%98%E7%AD%89+%E6%95%B0%E5%AD%A6&page=2')
  })

  it('creates scoped request identifiers for moderation idempotency', () => {
    expect(requestId()).toMatch(/^admin-/)
    expect(requestId()).not.toBe(requestId())
  })
})
