import { PrismaClient } from '@prisma/client'
const userId = process.env.USER_ID
if (!userId) throw new Error('请通过 USER_ID 环境变量指定已完成微信登录的用户 ID')
const prisma = new PrismaClient()
await prisma.user.update({ where: { id: userId }, data: { role: 'SUPER_ADMIN' } })
await prisma.$disconnect()
console.log(`已将用户 ${userId} 设置为 SUPER_ADMIN；请通过 /api/v1/admin/security/totp/setup 初始化动态验证码。`)
