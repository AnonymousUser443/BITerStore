import type { Prisma } from '@prisma/client'

type ReportTarget = { targetType: string; targetId: string }
export const reportStatusLabels: Record<string, string> = { OPEN: '待受理', PROCESSING: '处理中', RESOLVED: '已处理', REJECTED: '已驳回' }

export async function reportTargetLabels(db: Pick<Prisma.TransactionClient, 'listing' | 'user'>, reports: ReportTarget[]) {
  const listingIds = reports.filter((row) => row.targetType === 'LISTING').map((row) => row.targetId)
  const userIds = reports.filter((row) => row.targetType === 'USER').map((row) => row.targetId)
  const [listings, users] = await Promise.all([
    listingIds.length ? db.listing.findMany({ where: { id: { in: listingIds } }, select: { id: true, title: true } }) : [],
    userIds.length ? db.user.findMany({ where: { id: { in: userIds } }, select: { id: true, nickname: true } }) : []
  ])
  const labels = new Map<string, string>([
    ...listings.map((row): [string, string] => [`LISTING:${row.id}`, `商品《${row.title}》`]),
    ...users.map((row): [string, string] => [`USER:${row.id}`, `用户「${row.nickname}」`])
  ])
  return (report: ReportTarget) => labels.get(`${report.targetType}:${report.targetId}`) || `${({ LISTING: '商品', USER: '用户', MESSAGE: '消息' } as Record<string, string>)[report.targetType] || '对象'}（编号 ${report.targetId}）`
}

export function reportProgressBody(report: { id: string; reason: string }, targetLabel: string, status: string, resolution: string) {
  return `举报对象：${targetLabel}\n举报编号：${report.id}\n举报原因：${report.reason}\n处理状态：${reportStatusLabels[status] || status}\n${status === 'PROCESSING' ? '进度说明' : '处理结果'}：${resolution}`
}
