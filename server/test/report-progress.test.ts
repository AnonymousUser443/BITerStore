import { describe, expect, it, vi } from 'vitest'
import { ModerationController } from '../src/modules/moderation/moderation.controller.js'
import { AdminController } from '../src/modules/admin/admin.controller.js'
import { reportProgressBody } from '../src/modules/moderation/report-progress.js'

const reporter = { id: 'reporter', role: 'USER' as const, campusStatus: 'VERIFIED' }
const report = { id: 'report-1', targetType: 'LISTING', targetId: 'book-1', reason: '与图片描述不符', status: 'RESOLVED', resolution: '已核实并下架', createdAt: new Date(), updatedAt: new Date() }
function database(rows = [report]) {
  return { report: { findMany: vi.fn().mockResolvedValue(rows), findFirst: vi.fn().mockResolvedValue(null) }, listing: { findMany: vi.fn().mockResolvedValue([{ id: 'book-1', title: '高等数学' }]) }, user: { findMany: vi.fn() } } as any
}

describe('reporter progress visibility', () => {
  it('scopes history to its reporter and exposes object, reason and result without staff data', async () => {
    const db = database()
    const result = await new ModerationController(db).myReports(reporter)
    expect(db.report.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { reporterId: reporter.id }, take: 21 }))
    expect(db.report.findMany.mock.calls[0][0].select).not.toHaveProperty('assigneeId')
    expect(result.items[0]).toMatchObject({ targetLabel: '商品《高等数学》', reason: report.reason, status: 'RESOLVED', resolution: report.resolution })
    expect(result.nextCursor).toBeNull()
  })
  it('rejects another reporters cursor before querying the page', async () => {
    const db = database()
    await expect(new ModerationController(db).myReports(reporter, 'someone-elses-report')).rejects.toMatchObject({ status: 400 })
    expect(db.report.findMany).not.toHaveBeenCalled()
  })
  it('paginates without returning the lookahead row', async () => {
    const db = database(Array.from({ length: 21 }, (_, i) => ({ ...report, id: `report-${i}` })))
    const result = await new ModerationController(db).myReports(reporter)
    expect(result.items).toHaveLength(20)
    expect(result.nextCursor).toBe('report-19')
  })
  it('retains an identifiable target when a reported object has been removed', async () => {
    const db = database()
    db.listing.findMany.mockResolvedValue([])
    const result = await new ModerationController(db).myReports(reporter)
    expect(result.items[0].targetLabel).toContain('book-1')
    expect(result.items[0].resolution).toBe(report.resolution)
  })
  it('includes the report identity and full result in notification text', () => {
    const result = '处理说明'.repeat(120)
    const body = reportProgressBody(report, '商品《高等数学》', 'REJECTED', result)
    expect(body).toContain(report.id)
    expect(body).toContain(report.reason)
    expect(body).toContain('已驳回')
    expect(body).toContain(result)
  })
})

describe('administrator listing detail', () => {
  it.each([['PROCESSING', '处理中'], ['RESOLVED', '已处理'], ['REJECTED', '已驳回']])('persists identifiable reporter notifications for %s', async (action, label) => {
    const db = database()
    db.user.findUnique = vi.fn().mockResolvedValue({ id: 'admin', role: 'ADMIN', status: 'ACTIVE' })
    db.report.findUnique = vi.fn().mockResolvedValue({ ...report, status: 'OPEN', reporterId: reporter.id })
    db.report.update = vi.fn().mockResolvedValue({})
    db.notification = { create: vi.fn().mockResolvedValue({}) }
    db.auditLog = { findFirst: vi.fn().mockResolvedValue(null), create: vi.fn().mockResolvedValue({}) }
    db.moderationAction = { create: vi.fn().mockResolvedValue({}) }
    db.$transaction = vi.fn(async (callback: (tx: any) => Promise<unknown>) => callback(db))
    await new AdminController(db).action({ id: 'admin', role: 'ADMIN', campusStatus: 'VERIFIED', adminTotp: true }, { targetType: 'REPORT', targetId: report.id, action, reason: '已核实举报内容并告知处理结论' })
    const notification = db.notification.create.mock.calls[0][0].data
    expect(notification.userId).toBe(reporter.id)
    expect(notification.title).toContain(label)
    expect(notification.body).toContain('商品《高等数学》')
    expect(notification.body).toContain(report.id)
    expect(notification.body).toContain(report.reason)
    expect(notification.body).toContain('已核实举报内容并告知处理结论')
  })
  it('reads pending details and evidence without a public visibility filter or object credentials', async () => {
    const db = { listing: { findUnique: vi.fn().mockResolvedValue({ id: 'pending', status: 'PENDING_REVIEW', description: '审核中的完整描述', images: [{ id: 'isbn', role: 'ISBN' }] }) } } as any
    const result = await new AdminController(db).listingDetail('pending')
    expect(result.status).toBe('PENDING_REVIEW')
    expect(result.images[0].role).toBe('ISBN')
    expect(db.listing.findUnique.mock.calls[0][0].where).toEqual({ id: 'pending' })
    expect(db.listing.findUnique.mock.calls[0][0].select.images.select).not.toHaveProperty('objectKey')
  })
  it('returns a clear missing-item response', async () => {
    const db = { listing: { findUnique: vi.fn().mockResolvedValue(null) } } as any
    await expect(new AdminController(db).listingDetail('missing')).rejects.toMatchObject({ status: 404 })
  })
})
