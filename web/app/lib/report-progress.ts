export interface ReportProgress {
  id: string
  targetType: string
  targetId: string
  targetLabel: string
  reason: string
  status: 'OPEN' | 'PROCESSING' | 'RESOLVED' | 'REJECTED'
  resolution: string | null
  createdAt: string
  updatedAt: string
}
export interface ReportProgressPage { items: ReportProgress[]; nextCursor: string | null }
export const reportStatusLabels = { OPEN: '待受理', PROCESSING: '处理中', RESOLVED: '已处理', REJECTED: '已驳回' }
export function reportResolution(report: ReportProgress) {
  return report.resolution || (report.status === 'OPEN' ? '举报已提交，等待工作人员受理。' : report.status === 'PROCESSING' ? '工作人员正在核实，尚未给出最终结论。' : '历史工单未填写处理说明。')
}
