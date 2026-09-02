import { PrismaClient, Role } from '@prisma/client'

const prisma = new PrismaClient()
const userId = process.env.USER_ID?.trim()
const studentNumber = process.env.STUDENT_NUMBER?.trim()
const role = (process.env.ADMIN_ROLE?.trim() || 'SUPER_ADMIN') as Role

if ((!userId && !studentNumber) || (userId && studentNumber)) {
  throw new Error('请通过 USER_ID 或 STUDENT_NUMBER 指定一个已完成校园认证的用户（二者只能填写一个）')
}
if (!['MODERATOR', 'ADMIN', 'SUPER_ADMIN'].includes(role)) {
  throw new Error('ADMIN_ROLE 只允许 MODERATOR、ADMIN 或 SUPER_ADMIN')
}

try {
  const user = await prisma.user.findUnique({
    where: userId ? { id: userId } : { studentNumber: studentNumber! },
    select: { id: true, nickname: true, status: true, campusStatus: true, role: true }
  })
  if (!user) throw new Error('未找到指定用户')
  if (user.status !== 'ACTIVE' || user.campusStatus !== 'VERIFIED') throw new Error('只能授权状态正常且已完成校园认证的用户')
  await prisma.user.update({ where: { id: user.id }, data: { role } })
  console.log(`已将 ${user.nickname}（${user.id}）从 ${user.role} 调整为 ${role}；请访问 /admin/ 完成动态验证码设置。`)
} finally {
  await prisma.$disconnect()
}
