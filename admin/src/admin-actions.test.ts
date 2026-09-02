import { describe, expect, it } from 'vitest'
import { accessSummary, listingActions, listingDetailHref, reportActions, userActions } from './App'
import type { AdminIdentity, ListingRow, ReportRow, UserRow } from './types'

const identity: AdminIdentity = { id: 'operator', nickname: '管理员', role: 'ADMIN' }
const user = (values: Partial<UserRow> = {}): UserRow => ({
  id: 'user-1', nickname: '测试用户', role: 'USER', status: 'ACTIVE', campusStatus: 'VERIFIED',
  adminTotpEnabled: false, createdAt: '', updatedAt: '', recentAccess: [], _count: { listings: 0, reports: 0 }, ...values
})
const listing = (status: string): ListingRow => ({
  id: 'listing-1', title: '测试教材', author: '作者', isbn: '9780000000000', category: '教材',
  priceCents: 1200, campus: '良乡', status, viewCount: 0, createdAt: '',
  seller: { id: 'seller-1', nickname: '卖家', status: 'ACTIVE' }, images: [],
  _count: { favorites: 0, conversations: 0 }
})
const report = (status: string): ReportRow => ({
  id: 'report-1', targetType: 'LISTING', targetId: 'listing-1', reason: '违规内容', status,
  createdAt: '', updatedAt: '', reporter: { id: 'reporter-1', nickname: '举报人' }
})

describe('admin action visibility', () => {
  it('does not allow an operator to manage self or a peer role', () => {
    expect(userActions(user({ id: identity.id }), identity)).toEqual([])
    expect(userActions(user({ role: 'ADMIN' }), identity)).toEqual([])
    expect(userActions(user({ status: 'DELETED' }), identity)).toEqual([])
  })

  it('shows account safety actions without role grants to a normal admin', () => {
    const actions = userActions(user(), identity).map((item) => item.action)
    expect(actions).toContain('BANNED')
    expect(actions).toContain('REVOKE_SESSIONS')
    expect(actions.some((action) => action.startsWith('ROLE_'))).toBe(false)
  })

  it('allows a super administrator to delegate lower roles', () => {
    const actions = userActions(user(), { ...identity, role: 'SUPER_ADMIN' }).map((item) => item.action)
    expect(actions).toContain('ROLE_MODERATOR')
    expect(actions).toContain('ROLE_ADMIN')
  })

  it('only offers state-appropriate listing and report actions', () => {
    expect(listingActions(listing('ACTIVE')).map((item) => item.action)).toEqual(['IGNORE', 'BLOCKED'])
    expect(listingActions(listing('SOLD')).map((item) => item.action)).toEqual(['IGNORE', 'BLOCKED'])
    expect(listingActions({ ...listing('SOLD'), moderationDecision: 'IGNORE' })).toEqual([])
    expect(listingActions(listing('BLOCKED'))).toEqual([])
    expect(listingActions(listing('DRAFT'))).toEqual([])
    expect(reportActions(report('OPEN')).map((item) => item.action)).toEqual(['PROCESSING', 'RESOLVED', 'REJECTED'])
    expect(reportActions(report('RESOLVED'))).toEqual([])
  })

  it('builds a safe H5 product detail URL', () => {
    expect(listingDetailHref('listing/id with spaces')).toBe('/books?id=listing%2Fid%20with%20spaces')
  })

  it('labels access channels and device classes for administrators', () => {
    const base = { lastSeenAt: '', active: true }
    expect(accessSummary({ ...base, platform: 'weapp', device: 'phone' })).toBe('微信小程序 · 手机')
    expect(accessSummary({ ...base, platform: 'h5', device: 'desktop' })).toBe('浏览器 · 电脑')
    expect(accessSummary({ ...base, platform: 'h5', device: 'tablet' })).toBe('浏览器 · 平板')
  })
})
