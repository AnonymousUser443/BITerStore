import { PrismaClient } from '@prisma/client'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'

export const DEFAULT_ACCOUNT_RECOVERY_DAYS = 30

export async function cleanupAccountRecoveryLinks(prisma: {
  user: { findMany(args: unknown): Promise<Array<{ id: string }>> }
  campusIdentity: { deleteMany(args: unknown): Promise<{ count: number }> }
}, now = new Date(), recoveryDays = Number(process.env.ACCOUNT_RECOVERY_DAYS || DEFAULT_ACCOUNT_RECOVERY_DAYS)) {
  const days = Number.isFinite(recoveryDays) && recoveryDays > 0 ? Math.min(recoveryDays, 365) : DEFAULT_ACCOUNT_RECOVERY_DAYS
  const cutoff = new Date(now.getTime() - days * 86_400_000)
  const users = await prisma.user.findMany({
    where: { status: 'DELETED', deletedAt: { lt: cutoff }, campusIdentities: { some: {} } },
    select: { id: true }
  })
  const result = users.length
    ? await prisma.campusIdentity.deleteMany({ where: { userId: { in: users.map((user) => user.id) } } })
    : { count: 0 }
  return { cutoff, users: users.length, removedIdentityLinks: result.count }
}

async function main() {
  const prisma = new PrismaClient()
  try {
    console.log(JSON.stringify({ accountRecoveryCleanup: await cleanupAccountRecoveryLinks(prisma) }))
  } finally {
    await prisma.$disconnect()
  }
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : ''
if (invokedPath && resolve(fileURLToPath(import.meta.url)) === invokedPath) void main()
