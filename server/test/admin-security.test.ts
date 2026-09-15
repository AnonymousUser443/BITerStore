import { describe, expect, it, vi } from 'vitest'
import { AdminSecurityController } from '../src/modules/admin/admin-security.controller.js'

describe('administrator security setup', () => {
  it('uses the current database role after a bootstrap promotion', async () => {
    const prisma: any = { user: { findUnique: vi.fn().mockResolvedValue({
      id: 'admin-1', nickname: '管理员', role: 'SUPER_ADMIN', status: 'ACTIVE', campusStatus: 'VERIFIED', adminTotpEnabled: false
    }) } }
    const result = await new AdminSecurityController(prisma).status({ id: 'admin-1', role: 'USER', campusStatus: 'VERIFIED' })
    expect(result).toEqual({
      user: { id: 'admin-1', nickname: '管理员', role: 'SUPER_ADMIN', campusStatus: 'VERIFIED' },
      totpEnabled: false
    })
  })

  it('refuses browser-based TOTP replacement after it has been enabled', async () => {
    const prisma: any = { user: {
      findUnique: vi.fn().mockResolvedValue({ id: 'admin-1', role: 'ADMIN', status: 'ACTIVE', campusStatus: 'VERIFIED', adminTotpEnabled: true }),
      update: vi.fn()
    } }
    await expect(new AdminSecurityController(prisma).setup({ id: 'admin-1', role: 'ADMIN', campusStatus: 'VERIFIED' })).rejects.toMatchObject({ status: 400 })
    expect(prisma.user.update).not.toHaveBeenCalled()
  })

  it('encodes the Chinese issuer while keeping the otpauth label delimiter valid', async () => {
    const prisma: any = { user: {
      findUnique: vi.fn().mockResolvedValue({ id: 'admin-1', nickname: '管理员', role: 'ADMIN', status: 'ACTIVE', campusStatus: 'VERIFIED', adminTotpEnabled: false }),
      update: vi.fn()
    } }
    const result = await new AdminSecurityController(prisma).setup({ id: 'admin-1', role: 'ADMIN', campusStatus: 'VERIFIED' })
    expect(result.otpauthUrl).toMatch(/^otpauth:\/\/totp\/%E6%A2%A8%E8%8B%91%E5%84%BF:admin-1\?secret=[A-Z2-7]+&issuer=%E6%A2%A8%E8%8B%91%E5%84%BF$/)
  })
})
