import { describe, expect, it, vi } from 'vitest'
import { HttpException, HttpStatus } from '@nestjs/common'
import { ModerationController } from '../src/modules/moderation/moderation.controller.js'

const reporter = { id: 'reporter-1', role: 'USER' as const, campusStatus: 'VERIFIED' }

function prismaMock(overrides: Record<string, unknown> = {}) {
  return {
    report: { findFirst: vi.fn().mockResolvedValue(null), create: vi.fn().mockResolvedValue({ id: 'report-1' }), count: vi.fn().mockResolvedValue(0) },
    listing: { findFirst: vi.fn().mockResolvedValue({ id: 'listing-1', sellerId: 'seller-1', status: 'ACTIVE' }) },
    user: { findUnique: vi.fn().mockResolvedValue({ id: 'user-2', status: 'ACTIVE' }) },
    block: { upsert: vi.fn(), deleteMany: vi.fn() },
    ...overrides
  } as any
}

describe('report target and quota hardening', () => {
  it('rejects unknown target types, missing targets and self reports', async () => {
    const prisma = prismaMock()
    const controller = new ModerationController(prisma)
    await expect(controller.report(reporter, { targetType: 'MESSAGE', targetId: 'm-1', reason: 'spam' })).rejects.toMatchObject({ status: 400 })
    prisma.listing.findFirst.mockResolvedValue(null)
    await expect(controller.report(reporter, { targetType: 'LISTING', targetId: 'missing', reason: 'spam' })).rejects.toMatchObject({ status: 404 })
    prisma.user.findUnique.mockResolvedValue({ id: reporter.id, status: 'ACTIVE' })
    await expect(controller.report(reporter, { targetType: 'USER', targetId: reporter.id, reason: 'spam' })).rejects.toMatchObject({ status: 400 })
  })

  it('returns an existing report instead of creating a duplicate', async () => {
    const prisma = prismaMock()
    prisma.report.findFirst.mockResolvedValue({ id: 'existing', status: 'OPEN' })
    const result = await new ModerationController(prisma).report(reporter, { targetType: 'LISTING', targetId: 'listing-1', reason: 'spam' })
    expect(result).toMatchObject({ id: 'existing' })
    expect(prisma.report.create).not.toHaveBeenCalled()
  })

  it('enforces the report quota with an atomic Redis counter', async () => {
    const prisma = prismaMock()
    const redis = { ensureConnected: vi.fn(), client: { eval: vi.fn().mockResolvedValue('11:1:1') } } as any
    const error = await new ModerationController(prisma, redis).report(reporter, { targetType: 'LISTING', targetId: 'listing-1', reason: 'spam' }).catch((cause) => cause)
    expect(error).toBeInstanceOf(HttpException)
    expect((error as HttpException).getStatus()).toBe(HttpStatus.TOO_MANY_REQUESTS)
    expect(prisma.report.create).not.toHaveBeenCalled()
  })
})
