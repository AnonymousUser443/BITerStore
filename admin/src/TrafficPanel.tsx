import { useEffect, useState } from 'react'
import { apiRequest } from './api'
import type { TrafficMetrics } from './types'

const series = [
  { key: '2xx', label: '成功', color: '#91ad80' },
  { key: '3xx', label: '重定向', color: '#d8bc73' },
  { key: '4xx', label: '客户端错误', color: '#de965b' },
  { key: '5xx', label: '服务端错误', color: '#cb6861' },
] as const
export function TrafficPanel() {
  const [days, setDays] = useState(1)
  const [reload, setReload] = useState(0)
  const [data, setData] = useState<TrafficMetrics | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [selected, setSelected] = useState<number | null>(null)
  const [hidden, setHidden] = useState<string[]>([])
  useEffect(() => {
    let active = true
    setBusy(true); setError(''); setData(null); setSelected(null)
    apiRequest<TrafficMetrics>(`/admin/traffic?days=${days}`).then(value => { if (active) setData(value) }).catch(() => { if (active) setError('流量数据加载失败，请重试。') }).finally(() => { if (active) setBusy(false) })
    return () => { active = false }
  }, [days, reload])
  const today = data?.days[0]
  const currentHour = data ? Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Shanghai', hour: '2-digit', hourCycle: 'h23' }).format(new Date(data.generatedAt))) : 0
  const points = days === 1
    ? (today?.hourlyRequests || []).slice(0, currentHour + 1).map((requests, hour) => ({ label: `${today?.date} ${String(hour).padStart(2, '0')}:00`, short: `${String(hour).padStart(2, '0')}:00`, requests, visitors: today?.hourlyVisitors[hour] || 0, status: today!.hourlyStatus[hour], observed: today!.observed }))
    : [...(data?.days || [])].reverse().map(day => ({ ...day, label: day.date, short: day.date.slice(5) }))
  const visible = (key: string) => !hidden.includes(key)
  const toggle = (key: string) => setHidden(old => old.includes(key) ? old.filter(item => item !== key) : [...old, key])
  const peak = Math.max(1, ...points.map(p => p.requests))
  const visitorPeak = Math.max(1, ...points.map(p => p.visitors))
  const total = points.reduce((sum, p) => sum + p.requests, 0)
  const average = total / Math.max(1, points.length)
  const x = (index: number) => 65 + (index + .5) * 880 / Math.max(1, points.length)
  const y = (value: number) => 300 - value / peak * 240
  const vy = (value: number) => 300 - value / visitorPeak * 240
  const focus = selected === null ? null : points[selected]
  return <section className="traffic-panel keeper-panel">
    <div className="traffic-header"><div><p className="eyebrow">访问监测 · 北京时间 UTC+8</p><h2>流量趋势</h2><p>按响应状态统计请求，叠加访问人数趋势。</p></div><div className="traffic-controls"><select aria-label="统计范围" value={days} onChange={e => setDays(Number(e.target.value))}><option value={1}>今日</option><option value={7}>近 7 个自然日</option><option value={14}>近 14 个自然日</option></select><button className="secondary" disabled={busy} onClick={() => setReload(n => n + 1)}>刷新</button></div></div>
    {busy && <p role="status">正在加载流量数据…</p>}
    {error && <p role="alert" className="error-banner">{error}</p>}
    {data && <>
      <div className="traffic-cards"><article><span>范围内请求次数</span><strong>{total.toLocaleString()}</strong></article><article><span>今日独立访客（估算）</span><strong>{today?.visitors.toLocaleString()}</strong></article><article><span>范围内服务端错误</span><strong>{points.reduce((n, p) => n + p.status['5xx'], 0).toLocaleString()}</strong></article></div>
      <div className="traffic-legend">{[...series, { key: 'visitors', label: '访问人数（右轴）', color: '#32aaa2' }].map(s => <button key={s.key} aria-pressed={visible(s.key)} onClick={() => toggle(s.key)} style={{ opacity: visible(s.key) ? 1 : .4 }}><i style={{ background: s.color }} />{s.label}</button>)}<span>平均请求：{average.toFixed(1)}</span></div>
      <div className="traffic-plot"><svg viewBox="0 0 1000 345" role="img" aria-label="流量趋势：左轴请求次数，右轴访问人数">
        {[0, 1, 2, 3, 4].map(tick => <g key={tick}><line x1="65" x2="945" y1={60 + tick * 60} y2={60 + tick * 60} stroke="#e3e1d7" /><text x="55" y={65 + tick * 60} textAnchor="end">{Math.round(peak * (4 - tick) / 4)}</text><text x="955" y={65 + tick * 60}>{Math.round(visitorPeak * (4 - tick) / 4)}</text></g>)}
        <text x="65" y="28">请求次数</text><text x="945" y="28" textAnchor="end">访问人数</text>
        {points.map((p, index) => { let base = 0; return <g key={p.label}>{series.filter(s => visible(s.key)).map(s => { const value = p.status[s.key]; const bottom = base; base += value; return <rect key={s.key} x={x(index) - 300 / points.length} y={y(base)} width={600 / points.length} height={(value / peak) * 240} fill={s.color} /> })}{(index % Math.max(1, Math.ceil(points.length / 8)) === 0 || index === points.length - 1) && <text x={x(index)} y="327" textAnchor="middle">{p.short}</text>}</g> })}
        <line x1="65" x2="945" y1={y(average)} y2={y(average)} stroke="#8a9383" strokeDasharray="5 5" />
        {visible('visitors') && <polyline points={points.map((p, i) => `${x(i)},${vy(p.visitors)}`).join(' ')} fill="none" stroke="#32aaa2" strokeWidth="3" />}
        {points.map((p, i) => <g key={p.label}><circle cx={x(i)} cy={vy(p.visitors)} r={visible('visitors') ? 3 : 0} fill="#32aaa2" /><rect tabIndex={0} aria-label={`${p.label}：${p.requests} 次请求，${p.visitors} 位访客`} x={65 + i * 880 / points.length} y="50" width={880 / points.length} height="260" fill={selected === i ? '#91ad8020' : 'transparent'} onMouseEnter={() => setSelected(i)} onFocus={() => setSelected(i)} onClick={() => setSelected(i)} /></g>)}
      </svg></div>
      <div className="traffic-detail" aria-live="polite">{focus ? <><strong>{focus.label}</strong><span>请求 {focus.requests} · 访客 ≈ {focus.visitors}</span><span>{series.map(s => `${s.label} ${focus.status[s.key]}`).join(' · ')}</span>{!focus.observed && <span>该日暂无新口径采集数据</span>}</> : <span>悬停、点击或用 Tab 选择时间点查看详情。</span>}</div>
      <p className="traffic-footnote">北京时间自然日统计；今日截止当前小时，最后一桶尚未结束。访客按用户或 IP 与浏览器组合估算，各时段人数不可相加。仅统计到达 API 的请求，排除后台和健康检查；连接失败及静态页面访问不包含在内。</p>
      <p className="traffic-footnote">新口径从本次更新后开始采集，旧 UTC 数据不混入。更新时间：{new Date(data.generatedAt).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false })}</p>
    </>}
  </section>
}
