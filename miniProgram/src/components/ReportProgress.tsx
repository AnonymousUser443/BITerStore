import { useCallback, useEffect, useState } from 'react'
import { Button, Text, View } from '@tarojs/components'
import { apiRequest } from '@/domain/api'
import { formatMessageTime } from '@/domain/date-time'
import { type ReportProgress as ReportItem, type ReportProgressPage, reportResolution, reportStatusLabels } from '@/domain/report-progress'

export function ReportProgressList() {
  const [items, setItems] = useState<ReportItem[]>([])
  const [cursor, setCursor] = useState<string | null>(null)
  const [busy, setBusy] = useState(true)
  const [error, setError] = useState('')
  const load = useCallback(async (next?: string) => {
    setBusy(true); setError('')
    try {
      const page: ReportProgressPage = __API_URL__ && !__BITERSTORE_E2E__
        ? await apiRequest(`/reports/mine${next ? `?cursor=${encodeURIComponent(next)}` : ''}`)
        : { items: __BITERSTORE_E2E__ ? [{ id: 'report-qa', targetType: 'LISTING', targetId: 'math-7', targetLabel: '商品《高等数学（第七版）》', reason: '商品描述与图片不符', status: 'RESOLVED', resolution: '已核实并下架相关商品。', createdAt: '2026-09-17T08:00:00Z', updatedAt: '2026-09-18T08:00:00Z' }] : [], nextCursor: null }
      setItems((current) => next ? [...current, ...page.items.filter((item) => !current.some((known) => known.id === item.id))] : page.items)
      setCursor(page.nextCursor)
    } catch (cause) { setError(cause instanceof Error ? cause.message : '举报进度加载失败') }
    finally { setBusy(false) }
  }, [])
  useEffect(() => { void load() }, [load])
  return <View className='report-progress-list' id='e2e-report-progress'><Text className='report-progress-title'>我的举报进度</Text>
    {items.map((item) => <View className='report-progress-card' key={item.id}><View className='report-progress-heading'><Text className='report-target'>{item.targetLabel}</Text><Text>{reportStatusLabels[item.status]}</Text></View><Text className='report-number'>举报编号：{item.id}</Text><Text className='report-copy'>举报原因：{item.reason}</Text><Text className='report-copy'>{item.status === 'OPEN' || item.status === 'PROCESSING' ? '当前进度：' : '处理结果：'}{reportResolution(item)}</Text><Text className='report-time'>提交：{formatMessageTime(item.createdAt)}</Text><Text className='report-time'>更新：{formatMessageTime(item.updatedAt)}</Text></View>)}
    {error && <Text>{error}</Text>}{busy && <Text>正在加载举报进度…</Text>}
    {!busy && !error && items.length === 0 && <Text>你还没有提交过举报。</Text>}
    {(cursor || error) && <Button className='secondary-button' disabled={busy} onClick={() => { void load(cursor || undefined) }}>{error ? '重试' : '加载更多举报'}</Button>}
  </View>
}
