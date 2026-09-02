import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()
const userId = process.env.USER_ID?.trim()
const studentNumber = process.env.STUDENT_NUMBER?.trim()

if (process.env.CONFIRM_TOTP_RESET !== 'RESET') {
  throw new Error('这是安全恢复操作。确认后请设置 CONFIRM_TOTP_RESET=RESET')
}
if ((!userId && !studentNumber) || (userId && studentNumber)) {
  throw new Error('请通过 USER_ID 或 STUDENT_NUMBER 指定一个管理员（二者只能填写一个）')
}

try {
  const user = await prisma.user.findUnique({
    where: userId ? { id: userId } : { studentNumber: studentNumber! },
    select: { id: true, nickname: true, role: true }
  })
  if (!user || !['MODERATOR', 'ADMIN', 'SUPER_ADMIN'].includes(user.role)) throw new Error('未找到指定管理员账号')
  await prisma.$transaction([
    prisma.user.update({ where: { id: user.id }, data: { adminTotpEnabled: false, adminTotpSecret: null } }),
    prisma.session.updateMany({ where: { userId: user.id, revokedAt: null }, data: { revokedAt: new Date() } })
  ])
  console.log(`已重置 ${user.nickname}（${user.id}）的动态验证码并撤销现有登录会话。请重新登录后访问 /admin/ 完成设置。`)
} finally {
  await prisma.$disconnect()
}
