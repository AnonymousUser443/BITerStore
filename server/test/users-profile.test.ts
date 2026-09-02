import { BadRequestException } from '@nestjs/common'
import { describe, expect, it, vi } from 'vitest'
import { UsersController } from '../src/modules/users/users.controller.js'

const authUser = { id: 'student-1', role: 'USER', campusStatus: 'VERIFIED' } as const

describe('user profile', () => {
  function setup() {
    const profile = {
      id: 'student-1', nickname: 'BITer1120230000', avatarUrl: null, campus: '良乡', bio: '',
      role: 'USER', status: 'ACTIVE', campusStatus: 'VERIFIED', createdAt: new Date(),
      _count: { wechatAccounts: 0 }
    }
    const prisma = { user: { update: vi.fn(), findUniqueOrThrow: vi.fn().mockResolvedValue(profile) }, userFeedback: { create: vi.fn().mockResolvedValue({ id: 'feedback-1' }) } }
    return { prisma, controller: new UsersController(prisma as any) }
  }

  it('returns and updates the authenticated student profile', async () => {
    const { prisma, controller } = setup()
    await expect(controller.update(authUser, { nickname: '  New BITer  ', campus: '中关村', bio: 'Hello' })).resolves.toMatchObject({
      id: 'student-1', nickname: 'BITer1120230000', wechatBound: false
    })
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'student-1' }, data: { nickname: 'New BITer', campus: '中关村', bio: 'Hello' }
    })
  })

  it('rejects empty nicknames and unsafe avatar values', async () => {
    const { controller } = setup()
    await expect(controller.update(authUser, { nickname: ' ' })).rejects.toBeInstanceOf(BadRequestException)
    await expect(controller.update(authUser, { avatarUrl: 'javascript:alert(1)' })).rejects.toBeInstanceOf(BadRequestException)
  })

  it('submits a trimmed Bug or suggestion for the authenticated user', async () => {
    const { prisma, controller } = setup()
    await expect(controller.submitFeedback(authUser, { type: 'bug', content: '  登录按钮没有响应  ', platform: 'weapp' })).resolves.toEqual({ id: 'feedback-1' })
    expect(prisma.userFeedback.create).toHaveBeenCalledWith({
      data: { userId: 'student-1', type: 'BUG', content: '登录按钮没有响应', platform: 'WEAPP' }
    })
  })

  it('rejects an unknown feedback type or blank content', async () => {
    const { controller } = setup()
    expect(() => controller.submitFeedback(authUser, { type: 'QUESTION', content: '内容' })).toThrow(BadRequestException)
    expect(() => controller.submitFeedback(authUser, { type: 'SUGGESTION', content: ' ' })).toThrow(BadRequestException)
  })
})
