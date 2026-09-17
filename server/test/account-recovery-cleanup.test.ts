import { describe, expect, it, vi } from 'vitest'
import { cleanupAccountRecoveryLinks } from '../src/maintenance/cleanup-account-recovery-links.js'

describe('deleted account recovery cleanup', () => {
  it('removes identity links after the configured recovery period', async () => {
    const prisma = {
      user: { findMany: vi.fn().mockResolvedValue([{ id: 'deleted-user' }]) },
      campusIdentity: { deleteMany: vi.fn().mockResolvedValue({ count: 1 }) }
    }
    const now = new Date('2026-09-15T00:00:00.000Z')
    await expect(cleanupAccountRecoveryLinks(prisma, now, 30)).resolves.toMatchObject({ users: 1, removedIdentityLinks: 1 })
    expect(prisma.user.findMany).toHaveBeenCalledWith({
      where: { status: 'DELETED', deletedAt: { lt: new Date('2026-08-16T00:00:00.000Z') }, campusIdentities: { some: {} } },
      select: { id: true }
    })
  })
})
