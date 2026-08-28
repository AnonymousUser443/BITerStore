import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()
async function main() { await prisma.systemConfig.upsert({ where: { key: 'platform' }, create: { key: 'platform', value: { maintenance: false, announcement: 'BITerStore 校内测试中' } }, update: {} }) }
void main().finally(() => prisma.$disconnect())
