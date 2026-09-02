import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react'
import {
  AlertTriangle, BookOpen, Check, ChevronLeft, ChevronRight, ClipboardList, Copy,
  ExternalLink, KeyRound, LayoutDashboard, LogOut, MessageSquareText, RefreshCw, Search, ShieldCheck, Users, X
} from 'lucide-react'
import { ADMIN_TOKEN_KEY, API_ROOT, ApiError, apiRequest, queryString, refreshBrowserSession, requestId } from './api'
import type {
  AdminIdentity, AuditRow, ElevatedSession, FeedbackRow, ListingRow, Metrics, PageResult,
  PendingAction, ReportRow, SecurityStatus, TotpSetup, UserRow, View
} from './types'

const navigation: Array<{ key: View; label: string; hint: string; icon: typeof LayoutDashboard }> = [
  { key: 'dashboard', label: '数据看板', hint: '平台概况', icon: LayoutDashboard },
  { key: 'users', label: '用户管理', hint: '账号与权限', icon: Users },
  { key: 'listings', label: '商品治理', hint: '在售与违规', icon: BookOpen },
  { key: 'reports', label: '举报工单', hint: '受理与结案', icon: ClipboardList },
  { key: 'feedback', label: '用户反馈', hint: 'Bug 与建议', icon: MessageSquareText },
  { key: 'audit', label: '审计日志', hint: '操作留痕', icon: ShieldCheck }
]

const labels: Record<string, string> = {
  ACTIVE: '正常', MUTED: '已禁言', BANNED: '已封禁', DELETED: '已注销',
  USER: '普通用户', MODERATOR: '协管员', ADMIN: '管理员', SUPER_ADMIN: '超级管理员',
  VERIFIED: '已认证', UNVERIFIED: '未认证', PENDING: '认证中', EXPIRED: '认证过期', REVOKED: '认证撤销',
  DRAFT: '草稿', PENDING_REVIEW: '待审核', RESERVED: '已预订', SOLD: '已售', OFF_SHELF: '已下架', BLOCKED: '违规屏蔽',
  IGNORE: '已忽略', REVIEWED: '已处置', ALL: '全部',
  OPEN: '待处理', PROCESSING: '处理中', RESOLVED: '已解决', REJECTED: '已驳回',
  BUG: 'Bug', SUGGESTION: '建议', H5: '网页端', WEAPP: '微信小程序',
  REVOKE_SESSIONS: '下线全部设备', ROLE_USER: '设为普通用户', ROLE_MODERATOR: '设为协管员', ROLE_ADMIN: '设为管理员'
}

const listingStatusLabels: Record<string, string> = {
  DRAFT: '草稿', PENDING_REVIEW: '待审核', ACTIVE: '在售', RESERVED: '已预订', SOLD: '已售',
  OFF_SHELF: '已下架', BLOCKED: '违规屏蔽'
}

const metricCards: Array<{ key: keyof Metrics; label: string; note: string; tone: string }> = [
  { key: 'users', label: '注册用户', note: '全部账号', tone: 'sage' },
  { key: 'activeUsers', label: '正常用户', note: '当前可用', tone: 'moss' },
  { key: 'newUsers', label: '近 7 日新增', note: '新注册用户', tone: 'sky' },
  { key: 'listings', label: '有效商品', note: '未删除商品', tone: 'sand' },
  { key: 'activeListings', label: '正在出售', note: '买家可见', tone: 'moss' },
  { key: 'newListings', label: '近 7 日发布', note: '新增商品', tone: 'sky' },
  { key: 'sold', label: '已售商品', note: '累计成交标记', tone: 'sage' },
  { key: 'openReports', label: '待办举报', note: '待处理或处理中', tone: 'alert' }
]

export default function App() {
  const [identity, setIdentity] = useState<AdminIdentity | null>(null)
  return identity
    ? <AdminConsole identity={identity} onSessionExpired={() => setIdentity(null)} />
    : <AccessGate onAuthenticated={setIdentity} />
}

function AccessGate({ onAuthenticated }: { onAuthenticated: (user: AdminIdentity) => void }) {
  const [stage, setStage] = useState<'checking' | 'login' | 'verify' | 'setup'>('checking')
  const [identity, setIdentity] = useState<AdminIdentity | null>(null)
  const [bootstrapToken, setBootstrapToken] = useState<string | null>(null)
  const [draftToken, setDraftToken] = useState('')
  const [code, setCode] = useState('')
  const [setup, setSetup] = useState<TotpSetup | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)

  useEffect(() => { void restore() }, [])

  async function restore() {
    const stored = sessionStorage.getItem(ADMIN_TOKEN_KEY)
    if (stored) {
      try {
        const status = await apiRequest<SecurityStatus>('/admin/security/status', {}, stored)
        onAuthenticated(status.user)
        return
      } catch {
        sessionStorage.removeItem(ADMIN_TOKEN_KEY)
      }
    }
    await inspectSession(null, true)
  }

  async function inspectSession(token: string | null, allowRefresh = false) {
    setBusy(true)
    setError('')
    try {
      let status: SecurityStatus
      try {
        status = await apiRequest<SecurityStatus>('/admin/security/status', {}, token)
      } catch (cause) {
        if (allowRefresh && cause instanceof ApiError && cause.status === 401) {
          await refreshBrowserSession()
          status = await apiRequest<SecurityStatus>('/admin/security/status', {}, null)
        } else throw cause
      }
      setIdentity(status.user)
      setBootstrapToken(token)
      setStage(status.totpEnabled ? 'verify' : 'setup')
    } catch (cause) {
      setStage('login')
      if (!allowRefresh || token || (cause instanceof ApiError && cause.status === 403)) setError(messageOf(cause))
    } finally {
      setBusy(false)
    }
  }

  async function createSetup() {
    setBusy(true)
    setError('')
    try {
      setSetup(await apiRequest<TotpSetup>('/admin/security/totp/setup', { method: 'POST', body: '{}' }, bootstrapToken))
    } catch (cause) { setError(messageOf(cause)) } finally { setBusy(false) }
  }

  async function enableSetup() {
    if (code.length !== 6) return
    setBusy(true)
    setError('')
    try {
      await apiRequest('/admin/security/totp/enable', { method: 'POST', body: JSON.stringify({ code }) }, bootstrapToken)
      setCode('')
      setStage('verify')
    } catch (cause) { setError(messageOf(cause)) } finally { setBusy(false) }
  }

  async function verify(event: FormEvent) {
    event.preventDefault()
    if (code.length !== 6) return
    setBusy(true)
    setError('')
    try {
      const result = await apiRequest<ElevatedSession>('/admin/security/totp/verify', {
        method: 'POST', body: JSON.stringify({ code })
      }, bootstrapToken)
      sessionStorage.setItem(ADMIN_TOKEN_KEY, result.accessToken)
      onAuthenticated(result.user)
    } catch (cause) { setError(messageOf(cause)) } finally { setBusy(false) }
  }

  async function copySecret() {
    if (!setup) return
    await navigator.clipboard.writeText(setup.secret)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1600)
  }

  return <main className="access-page">
    <section className="access-card">
      <div className="brand-mark"><ShieldCheck size={28} /></div>
      <p className="eyebrow">BITerStore · Governance</p>
      <h1>校园二手书治理后台</h1>
      {stage === 'checking' && <div className="access-message"><span className="spinner" />正在检查管理员会话…</div>}

      {stage === 'login' && <>
        <p className="lead">先在本站完成校园身份登录，并确保该账号已经获得后台角色。</p>
        {error && <ErrorBanner message={error} />}
        <button className="primary wide" disabled={busy} onClick={() => void inspectSession(null, true)}>
          <KeyRound size={18} />{busy ? '正在验证…' : '使用当前网站登录状态'}
        </button>
        <a className="secondary-link" href="/login">尚未登录？前往校园身份登录 <ExternalLink size={15} /></a>
        <details className="advanced-login">
          <summary>高级：使用 access token</summary>
          <p>仅用于小程序或调试会话。令牌只保存在当前标签页。</p>
          <label>管理员 access token<input type="password" autoComplete="off" value={draftToken} onChange={(event) => setDraftToken(event.target.value.trim())} /></label>
          <button className="secondary wide" disabled={!draftToken || busy} onClick={() => void inspectSession(draftToken)}>
            验证令牌
          </button>
        </details>
      </>}

      {stage === 'setup' && <>
        <StepHeader step="首次安全设置" identity={identity} />
        <p className="lead">该账号尚未启用动态验证码。后台不会在启用后再次显示密钥，请妥善保存在验证器中。</p>
        {error && <ErrorBanner message={error} />}
        {!setup ? <button className="primary wide" disabled={busy} onClick={() => void createSetup()}>
          <ShieldCheck size={18} />{busy ? '正在生成…' : '生成动态验证码密钥'}
        </button> : <div className="setup-box">
          <ol><li>在 Microsoft Authenticator、Google Authenticator 等应用中添加账户。</li><li>打开下方配置链接，或手动输入密钥。</li><li>输入应用显示的 6 位验证码完成启用。</li></ol>
          <a className="otpauth-link" href={setup.otpauthUrl}>打开验证器配置 <ExternalLink size={15} /></a>
          <div className="secret-row"><code>{setup.secret}</code><button aria-label="复制密钥" onClick={() => void copySecret()}>{copied ? <Check size={17} /> : <Copy size={17} />}</button></div>
          <CodeInput code={code} setCode={setCode} />
          <button className="primary wide" disabled={code.length !== 6 || busy} onClick={() => void enableSetup()}>{busy ? '正在启用…' : '启用动态验证码'}</button>
        </div>}
      </>}

      {stage === 'verify' && <form onSubmit={(event) => void verify(event)}>
        <StepHeader step="管理员二次验证" identity={identity} />
        <p className="lead">输入验证器中的 6 位动态验证码。验证后的后台会话为短期会话。</p>
        {error && <ErrorBanner message={error} />}
        <CodeInput code={code} setCode={setCode} autoFocus />
        <button className="primary wide" disabled={code.length !== 6 || busy}>{busy ? '正在进入…' : '验证并进入后台'}</button>
      </form>}
      <p className="security-note">所有治理操作均记录操作人、对象、原因和请求标识。</p>
    </section>
  </main>
}

function StepHeader({ step, identity }: { step: string; identity: AdminIdentity | null }) {
  return <div className="step-header"><span>{step}</span>{identity && <strong>{identity.nickname} · {labels[identity.role]}</strong>}</div>
}

function CodeInput({ code, setCode, autoFocus = false }: { code: string; setCode: (value: string) => void; autoFocus?: boolean }) {
  return <label className="code-field">6 位动态验证码
    <input autoFocus={autoFocus} inputMode="numeric" autoComplete="one-time-code" maxLength={6} placeholder="000 000" value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))} />
  </label>
}

function AdminConsole({ identity, onSessionExpired }: { identity: AdminIdentity; onSessionExpired: () => void }) {
  const [view, setView] = useState<View>('dashboard')
  const [data, setData] = useState<Metrics | PageResult<UserRow | ListingRow | ReportRow | FeedbackRow | AuditRow> | null>(null)
  const [page, setPage] = useState(1)
  const [draftQ, setDraftQ] = useState('')
  const [draftFilters, setDraftFilters] = useState<Record<string, string>>({})
  const [query, setQuery] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [reloadKey, setReloadKey] = useState(0)
  const [pendingActions, setPendingActions] = useState<PendingAction[] | null>(null)

  useEffect(() => { void load() }, [view, page, query, reloadKey])

  async function load() {
    setBusy(true)
    setError('')
    try {
      const path = view === 'dashboard'
        ? '/admin/metrics'
        : `/admin/${view === 'audit' ? 'audit-logs' : view}${queryString({ ...query, page, pageSize: 20 })}`
      setData(await apiRequest(path))
    } catch (cause) {
      if (cause instanceof ApiError && (cause.status === 401 || cause.status === 403)) {
        sessionStorage.removeItem(ADMIN_TOKEN_KEY)
        onSessionExpired()
        return
      }
      setError(messageOf(cause))
    } finally { setBusy(false) }
  }

  function changeView(next: View) {
    setView(next)
    setPage(1)
    setDraftQ('')
    setDraftFilters({})
    setQuery({})
    setData(null)
  }

  function applyFilters(event: FormEvent) {
    event.preventDefault()
    const next = { ...draftFilters, q: draftQ.trim() }
    setPage(1)
    setQuery(next)
  }

  function clearFilters() {
    setDraftQ('')
    setDraftFilters({})
    setPage(1)
    setQuery({})
  }

  function logout() {
    sessionStorage.removeItem(ADMIN_TOKEN_KEY)
    onSessionExpired()
  }

  async function submitAction(action: PendingAction, reason: string) {
    await apiRequest('/admin/moderation-actions', {
      method: 'POST',
      body: JSON.stringify({ ...action, reason, requestId: requestId() })
    })
    setPendingActions(null)
    setNotice(`已完成：${action.actionLabel}`)
    setReloadKey((value) => value + 1)
    window.setTimeout(() => setNotice(''), 2500)
  }

  async function completeAction(action: PendingAction, reason: string) {
    await submitAction(action, action.action === 'IGNORE' ? '管理员确认无需处置' : reason)
  }

  function openActions(actions: PendingAction | PendingAction[]) {
    setPendingActions(Array.isArray(actions) ? actions : [actions])
  }

  const current = navigation.find((item) => item.key === view)!
  return <div className="admin-shell">
    <aside className="sidebar">
      <div className="sidebar-brand"><div className="brand-mark small"><ShieldCheck size={21} /></div><div><strong>BITerStore</strong><span>平台治理中心</span></div></div>
      <nav>{navigation.map(({ key, label, hint, icon: Icon }) => <button key={key} className={view === key ? 'active' : ''} onClick={() => changeView(key)}><Icon size={19} /><span><strong>{label}</strong><small>{hint}</small></span></button>)}</nav>
      <div className="operator"><span className="avatar">{identity.nickname.slice(0, 1)}</span><div><strong>{identity.nickname}</strong><small>{labels[identity.role]}</small></div><button title="退出后台" onClick={logout}><LogOut size={18} /></button></div>
    </aside>

    <main className="workspace">
      <header className="page-header"><div><p className="eyebrow">{current.hint}</p><h1>{current.label}</h1></div><button className="icon-button" disabled={busy} onClick={() => setReloadKey((value) => value + 1)} title="刷新"><RefreshCw className={busy ? 'spin' : ''} size={19} /></button></header>
      {view !== 'dashboard' && <FilterBar view={view} q={draftQ} setQ={setDraftQ} filters={draftFilters} setFilters={setDraftFilters} active={Object.values(query).some(Boolean)} onSubmit={applyFilters} onClear={clearFilters} />}
      {error && <ErrorBanner message={error} />}
      {notice && <div className="toast"><Check size={17} />{notice}</div>}
      <section className={busy && data ? 'content-area refreshing' : 'content-area'}>
        {!data ? (busy ? <LoadingRows /> : null) : view === 'dashboard'
          ? <Dashboard data={data as Metrics} openReports={() => changeView('reports')} />
          : <DataView view={view} data={data as PageResult<UserRow | ListingRow | ReportRow | FeedbackRow | AuditRow>} identity={identity} onAction={openActions} />}
      </section>
      {view !== 'dashboard' && data && <Pagination data={data as PageResult<unknown>} setPage={setPage} />}
    </main>
    {pendingActions && <ActionDialog actions={pendingActions} onClose={() => setPendingActions(null)} onConfirm={completeAction} />}
  </div>
}

function FilterBar({ view, q, setQ, filters, setFilters, active, onSubmit, onClear }: {
  view: View; q: string; setQ: (value: string) => void; filters: Record<string, string>;
  setFilters: (value: Record<string, string>) => void; active: boolean; onSubmit: (event: FormEvent) => void; onClear: () => void
}) {
  const placeholder = view === 'users' ? '搜索昵称或学号' : view === 'listings' ? '搜索书名、作者、ISBN 或卖家' : view === 'reports' ? '搜索原因、对象或举报人' : view === 'feedback' ? '搜索反馈内容、昵称或学号' : '搜索动作、资源或操作人'
  return <form className="filter-bar" onSubmit={onSubmit}>
    <label className="search-box"><Search size={17} /><input value={q} onChange={(event) => setQ(event.target.value)} placeholder={placeholder} /></label>
    {view === 'users' && <>
      <Select value={filters.status} label="账号状态" options={['ACTIVE', 'MUTED', 'BANNED', 'DELETED']} onChange={(value) => setFilters({ ...filters, status: value })} />
      <Select value={filters.role} label="角色" options={['USER', 'MODERATOR', 'ADMIN', 'SUPER_ADMIN']} onChange={(value) => setFilters({ ...filters, role: value })} />
      <Select value={filters.campusStatus} label="认证状态" options={['VERIFIED', 'UNVERIFIED', 'PENDING', 'EXPIRED', 'REVOKED']} onChange={(value) => setFilters({ ...filters, campusStatus: value })} />
    </>}
    {view === 'listings' && <>
      <ListingScopeSelect filters={filters} onChange={setFilters} />
      <Select value={filters.status} label="商品状态" options={['ACTIVE', 'RESERVED', 'SOLD', 'OFF_SHELF', 'BLOCKED', 'PENDING_REVIEW', 'DRAFT']} optionLabels={listingStatusLabels} onChange={(value) => setFilters({ ...filters, status: value, ...(value ? { reviewState: 'ALL' } : {}) })} />
    </>}
    {view === 'reports' && <Select value={filters.status} label="工单状态" options={['OPEN', 'PROCESSING', 'RESOLVED', 'REJECTED']} onChange={(value) => setFilters({ ...filters, status: value })} />}
    {view === 'feedback' && <Select value={filters.type} label="反馈类型" options={['BUG', 'SUGGESTION']} onChange={(value) => setFilters({ ...filters, type: value })} />}
    <button className="primary compact">筛选</button>
    {active && <button type="button" className="clear-button" onClick={onClear}><X size={16} />清除</button>}
  </form>
}

function Select({ value = '', label, options, optionLabels = labels, onChange }: { value?: string; label: string; options: string[]; optionLabels?: Record<string, string>; onChange: (value: string) => void }) {
  return <select aria-label={label} value={value} onChange={(event) => onChange(event.target.value)}><option value="">全部{label}</option>{options.map((option) => <option key={option} value={option}>{optionLabels[option] || option}</option>)}</select>
}

function ListingScopeSelect({ filters, onChange }: { filters: Record<string, string>; onChange: (value: Record<string, string>) => void }) {
  const scope = filters.reviewState === 'REVIEWED'
    ? 'REVIEWED'
    : filters.reviewState === 'ALL' && filters.status === 'ACTIVE' ? 'ACTIVE' : filters.reviewState === 'ALL' ? 'ALL' : 'PENDING'
  function selectScope(value: string) {
    if (value === 'ACTIVE') return onChange({ ...filters, reviewState: 'ALL', status: 'ACTIVE' })
    if (value === 'REVIEWED') return onChange({ ...filters, reviewState: 'REVIEWED', status: '' })
    if (value === 'ALL') return onChange({ ...filters, reviewState: 'ALL', status: '' })
    onChange({ ...filters, reviewState: 'PENDING', status: '' })
  }
  return <select aria-label="商品范围" value={scope} onChange={(event) => selectScope(event.target.value)}><option value="PENDING">待处置商品</option><option value="ACTIVE">在售商品</option><option value="REVIEWED">已处置商品</option><option value="ALL">全部商品</option></select>
}

function Dashboard({ data, openReports }: { data: Metrics; openReports: () => void }) {
  return <>
    <div className="metrics-grid">{metricCards.map((card) => <article className={`metric ${card.tone}`} key={card.key}><div><span>{card.label}</span><small>{card.note}</small></div><strong>{data[card.key]}</strong></article>)}</div>
    <div className="dashboard-note"><div><span className="pulse" /><div><strong>数据已同步</strong><p>统计时间：{dateTime(data.generatedAt)}</p></div></div>{data.openReports > 0 ? <button className="secondary" onClick={openReports}>处理 {data.openReports} 条举报</button> : <span className="all-clear"><Check size={16} />暂无举报待办</span>}</div>
  </>
}

function DataView({ view, data, identity, onAction }: { view: View; data: PageResult<UserRow | ListingRow | ReportRow | FeedbackRow | AuditRow>; identity: AdminIdentity; onAction: (action: PendingAction | PendingAction[]) => void }) {
  if (!data.items.length) return <EmptyState />
  if (view === 'users') return <UsersTable rows={data.items as UserRow[]} identity={identity} onAction={onAction} />
  if (view === 'listings') return <ListingsTable rows={data.items as ListingRow[]} onAction={onAction} />
  if (view === 'reports') return <ReportsTable rows={data.items as ReportRow[]} onAction={onAction} />
  if (view === 'feedback') return <FeedbackTable rows={data.items as FeedbackRow[]} />
  return <AuditTable rows={data.items as AuditRow[]} />
}

function UsersTable({ rows, identity, onAction }: { rows: UserRow[]; identity: AdminIdentity; onAction: (actions: PendingAction[]) => void }) {
  const [detailUser, setDetailUser] = useState<UserRow | null>(null)
  return <><Table headers={['用户', '账号 / 认证', '角色', '业务数据', '最后上线', '操作']}>{rows.map((row) => {
    const actions = userActions(row, identity)
    const latestAccess = row.recentAccess?.[0]
    return <tr key={row.id}>
      <td data-label="用户"><div className="user-cell"><span className="avatar">{row.nickname.slice(0, 1)}</span><div><strong>{row.nickname}</strong><code title={row.id}>{shortId(row.id)}</code><button type="button" className="table-detail-button" onClick={() => setDetailUser(row)}>用户详情</button></div></div></td>
      <td data-label="账号 / 认证"><Status value={row.status} /><Status value={row.campusStatus} subtle /></td>
      <td data-label="角色"><strong>{labels[row.role]}</strong>{row.adminTotpEnabled && <small className="inline-note">TOTP 已启用</small>}</td>
      <td data-label="业务数据"><strong>{row._count.listings} 本在售</strong><small className="inline-note">{row._count.reports} 次举报</small></td>
      <td data-label="最后上线">{row.lastSeenAt ? dateTime(row.lastSeenAt) : <span className="muted">从未登录</span>}{latestAccess && <small className="inline-note">{accessSummary(latestAccess)}</small>}</td>
      <td data-label="操作">{actions.length
        ? <button type="button" className="action-trigger" onClick={() => onAction(actions)}>处置</button>
        : <span className="muted">不可操作</span>}</td>
    </tr>
  })}</Table>{detailUser && <UserDetailDialog user={detailUser} onClose={() => setDetailUser(null)} />}</>
}

function ListingsTable({ rows, onAction }: { rows: ListingRow[]; onAction: (actions: PendingAction[]) => void }) {
  return <Table headers={['商品', '卖家', '价格 / 校区', '状态', '互动', '发布时间', '操作']}>{rows.map((row) => {
    const cover = row.images.find((image) => image.role === 'COVER') || row.images.find((image) => image.role !== 'ISBN')
    const actions = listingActions(row)
    return <tr key={row.id}>
      <td data-label="商品"><div className="listing-cell">{cover ? <img src={`${API_ROOT}/media/${cover.id}`} alt="" /> : <span className="cover-placeholder"><BookOpen size={19} /></span>}<div><strong>{row.title}</strong><small>{row.author || '作者未知'} · {row.isbn || '无 ISBN'}</small><code title={row.id}>{shortId(row.id)}</code><a className="listing-detail-link" href={listingDetailHref(row.id)} target="_blank" rel="noreferrer">查看详情 <ExternalLink size={12} /></a></div></div></td>
      <td data-label="卖家">{row.seller.nickname}<small className="inline-note">{labels[row.seller.status] || row.seller.status}</small></td>
      <td data-label="价格 / 校区"><strong>¥{(row.priceCents / 100).toFixed(2)}</strong><small className="inline-note">{row.campus}</small></td>
      <td data-label="状态"><Status value={row.status} label={listingStatusLabels[row.status]} />{row.moderationDecision === 'IGNORE' && <Status value="IGNORE" subtle />}</td>
      <td data-label="互动">{row.viewCount} 浏览<small className="inline-note">{row._count.favorites} 收藏 · {row._count.conversations} 会话</small></td>
      <td data-label="发布时间">{dateTime(row.createdAt)}</td>
      <td data-label="操作">{actions.length
        ? <button type="button" className="action-trigger" onClick={() => onAction(actions)}>处置</button>
        : <span className="muted">不可操作</span>}</td>
    </tr>
  })}</Table>
}

function ReportsTable({ rows, onAction }: { rows: ReportRow[]; onAction: (actions: PendingAction[]) => void }) {
  return <Table headers={['举报内容', '举报对象', '举报人', '状态', '提交时间', '操作']}>{rows.map((row) => {
    const actions = reportActions(row)
    return <tr key={row.id}>
      <td data-label="举报内容"><strong>{row.reason}</strong>{row.evidence && <small className="inline-note evidence">证据：{row.evidence}</small>}{row.resolution && <small className="inline-note resolution">结论：{row.resolution}</small>}</td>
      <td data-label="举报对象"><span>{row.target?.label || `${row.targetType} ${shortId(row.targetId)}`}</span>{row.target?.status && <Status value={row.target.status} label={row.targetType === 'LISTING' ? listingStatusLabels[row.target.status] : undefined} subtle />}{row.targetType === 'LISTING' && <a className="listing-detail-link" href={listingDetailHref(row.targetId)} target="_blank" rel="noreferrer">查看商品详情 <ExternalLink size={12} /></a>}</td>
      <td data-label="举报人">{row.reporter.nickname}</td>
      <td data-label="状态"><Status value={row.status} /></td>
      <td data-label="提交时间">{dateTime(row.createdAt)}</td>
      <td data-label="操作">{actions.length ? <button type="button" className="action-trigger" onClick={() => onAction(actions)}>处置</button> : <span className="muted">不可操作</span>}</td>
    </tr>
  })}</Table>
}

function FeedbackTable({ rows }: { rows: FeedbackRow[] }) {
  return <Table headers={['类型', '反馈内容', '反馈用户', '来源', '提交时间']}>{rows.map((row) => <tr key={row.id}>
    <td data-label="类型"><Status value={row.type} label={labels[row.type]} subtle={row.type === 'SUGGESTION'} /></td>
    <td data-label="反馈内容" className="feedback-content"><strong>{row.content}</strong></td>
    <td data-label="反馈用户"><strong>{row.user.nickname}</strong><small className="inline-note">学号 {row.user.studentNumber || '未绑定'}{row.user.campus ? ` · ${row.user.campus}` : ''}</small></td>
    <td data-label="来源">{labels[row.platform] || row.platform}</td>
    <td data-label="提交时间">{dateTime(row.createdAt)}</td>
  </tr>)}</Table>
}

function AuditTable({ rows }: { rows: AuditRow[] }) {
  return <Table headers={['操作', '对象', '操作员', '原因', '请求标识', '时间']}>{rows.map((row) => <tr key={row.id}>
    <td data-label="操作"><strong>{labels[row.action] || row.action}</strong></td>
    <td data-label="对象">{row.resourceType}<code title={row.resourceId || ''}>{row.resourceId ? shortId(row.resourceId) : '-'}</code></td>
    <td data-label="操作员">{row.actor?.nickname || '系统'}<small className="inline-note">{row.actor?.role ? labels[row.actor.role] : ''}</small></td>
    <td data-label="原因" className="reason-cell">{row.metadata?.reason || '-'}</td>
    <td data-label="请求标识"><code title={row.requestId}>{shortId(row.requestId, 14)}</code></td>
    <td data-label="时间">{dateTime(row.createdAt)}</td>
  </tr>)}</Table>
}

function Table({ headers, children }: { headers: string[]; children: ReactNode }) {
  return <div className="table-card"><table><thead><tr>{headers.map((header) => <th key={header}>{header}</th>)}</tr></thead><tbody>{children}</tbody></table></div>
}

function Pagination({ data, setPage }: { data: PageResult<unknown>; setPage: (page: number) => void }) {
  return <div className="pagination"><span>共 {data.total} 条 · 第 {data.page}/{data.pages} 页</span><div><button disabled={data.page <= 1} onClick={() => setPage(data.page - 1)}><ChevronLeft size={17} />上一页</button><button disabled={data.page >= data.pages} onClick={() => setPage(data.page + 1)}>下一页<ChevronRight size={17} /></button></div></div>
}

function ActionDialog({ actions, onClose, onConfirm }: { actions: PendingAction[]; onClose: () => void; onConfirm: (action: PendingAction, reason: string) => Promise<void> }) {
  const [selected, setSelected] = useState<PendingAction | null>(actions.length === 1 ? actions[0] : null)
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const target = actions[0]
  const acceptsReason = selected?.action !== 'IGNORE'
  const targetName = target?.targetType === 'USER' ? '用户' : target?.targetType === 'LISTING' ? '商品' : '举报'
  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!selected) return
    setBusy(true)
    setError('')
    try { await onConfirm(selected, reason.trim()) } catch (cause) { setError(messageOf(cause)); setBusy(false) }
  }
  if (!target) return null
  return <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onClose() }}><form className="dialog-panel action-dialog" role="dialog" aria-modal="true" aria-labelledby="action-dialog-title" onSubmit={(event) => void submit(event)}>
    <button type="button" className="dialog-close" aria-label="关闭" disabled={busy} onClick={onClose}><X size={19} /></button>
    <div className={`dialog-icon ${selected?.tone === 'danger' ? 'danger' : ''}`}>{selected?.tone === 'danger' ? <AlertTriangle size={22} /> : <ShieldCheck size={22} />}</div>
    <p className="eyebrow">治理操作确认</p><h2 id="action-dialog-title">处置{targetName}</h2>
    <p>对象：<strong>{target.targetLabel}</strong></p>
    <p className="dialog-guidance">选择处置方式后即可确认；处置原因选填，填写后会一并保留在审计记录中。</p>
    {actions.length > 1 && <fieldset className="action-choice-grid"><legend>处置方式</legend>{actions.map((action) => <button type="button" className={`${selected?.action === action.action ? 'selected' : ''} ${action.tone === 'danger' ? 'danger-choice' : ''}`} key={action.action} onClick={() => { setSelected(action); setReason(''); setError('') }}>{action.actionLabel}</button>)}</fieldset>}
    {selected?.action === 'IGNORE' && <div className="selected-action-note"><strong>忽略此商品</strong><span>记录本次审核结果，商品保持当前销售状态。</span></div>}
    {selected && acceptsReason && <label>处置原因（选填）<textarea autoFocus maxLength={300} value={reason} onChange={(event) => setReason(event.target.value)} placeholder={`可填写${selected.actionLabel}的原因，便于后续审计`} /><small>{reason.trim().length}/300</small></label>}
    {error && <ErrorBanner message={error} />}
    <div className="dialog-actions"><button type="button" className="secondary" disabled={busy} onClick={onClose}>取消</button><button className={selected?.tone === 'danger' ? 'danger-button' : 'primary'} disabled={busy || !selected}>{busy ? '正在提交…' : selected ? `确认${selected.actionLabel}` : '请先选择'}</button></div>
  </form></div>
}

function UserDetailDialog({ user, onClose }: { user: UserRow; onClose: () => void }) {
  const recentAccess = user.recentAccess || []
  return <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}><section className="dialog-panel user-detail-dialog" role="dialog" aria-modal="true" aria-labelledby="user-detail-title">
    <button type="button" className="dialog-close" aria-label="关闭" onClick={onClose}><X size={19} /></button>
    <div className="dialog-icon"><Users size={22} /></div>
    <p className="eyebrow">用户档案</p><h2 id="user-detail-title">{user.nickname}</h2>
    <dl className="user-detail-grid">
      <div><dt>账号状态</dt><dd><Status value={user.status} /></dd></div>
      <div><dt>校园认证</dt><dd><Status value={user.campusStatus} /></dd></div>
      <div><dt>学号</dt><dd>{user.studentNumber || '未绑定'}</dd></div>
      <div><dt>后台角色</dt><dd>{labels[user.role]}</dd></div>
      <div><dt>所在校区</dt><dd>{user.campus || '未填写'}</dd></div>
      <div><dt>在售书籍</dt><dd>{user._count.listings} 本</dd></div>
      <div><dt>被举报记录</dt><dd>{user._count.reports} 次</dd></div>
      <div><dt>注册时间</dt><dd>{dateTime(user.createdAt)}</dd></div>
      <div><dt>最后上线</dt><dd>{user.lastSeenAt ? dateTime(user.lastSeenAt) : '从未登录'}</dd></div>
    </dl>
    <div className="access-history"><h3>最近访问设备</h3>{recentAccess.length ? <ul>{recentAccess.map((access) => <li key={`${access.platform}-${access.device || 'unknown'}`}><div><strong>{accessSummary(access)}</strong><span>{dateTime(access.lastSeenAt)}</span></div><Status value={access.active ? 'ONLINE' : 'OFFLINE'} label={access.active ? '会话有效' : '已退出'} subtle /></li>)}</ul> : <p className="muted">暂无登录设备记录</p>}</div>
  </section></div>
}

export function userActions(row: UserRow, identity: AdminIdentity): PendingAction[] {
  const rank: Record<string, number> = { USER: 0, MODERATOR: 1, ADMIN: 2, SUPER_ADMIN: 3 }
  if (row.status === 'DELETED' || row.id === identity.id || rank[identity.role] <= rank[row.role]) return []
  const base = (action: string, actionLabel: string, tone?: 'danger'): PendingAction => ({ targetType: 'USER', targetId: row.id, targetLabel: row.nickname, action, actionLabel, tone })
  const actions: PendingAction[] = []
  if (row.status !== 'ACTIVE') actions.push(base('ACTIVE', '恢复账号'))
  if (row.status !== 'MUTED') actions.push(base('MUTED', '禁言账号'))
  if (row.status !== 'BANNED') actions.push(base('BANNED', '封禁账号', 'danger'))
  actions.push(base('REVOKE_SESSIONS', '下线全部设备', 'danger'))
  if (identity.role === 'SUPER_ADMIN' && row.role !== 'SUPER_ADMIN') {
    if (row.role !== 'USER') actions.push(base('ROLE_USER', '移除后台角色', 'danger'))
    if (row.status === 'ACTIVE' && row.campusStatus === 'VERIFIED') {
      if (row.role !== 'MODERATOR') actions.push(base('ROLE_MODERATOR', '设为协管员'))
      if (row.role !== 'ADMIN') actions.push(base('ROLE_ADMIN', '设为管理员'))
    }
  }
  return actions
}

export function listingActions(row: ListingRow): PendingAction[] {
  const base = (action: string, actionLabel: string, tone?: 'danger'): PendingAction => ({ targetType: 'LISTING', targetId: row.id, targetLabel: row.title, action, actionLabel, tone })
  return !row.moderationDecision && ['ACTIVE', 'RESERVED', 'SOLD', 'OFF_SHELF', 'PENDING_REVIEW'].includes(row.status)
    ? [base('IGNORE', '忽略'), base('BLOCKED', '违规屏蔽', 'danger')]
    : []
}

export function listingDetailHref(id: string) {
  return `/books?id=${encodeURIComponent(id)}`
}

export function reportActions(row: ReportRow): PendingAction[] {
  const base = (action: string, actionLabel: string, tone?: 'danger'): PendingAction => ({ targetType: 'REPORT', targetId: row.id, targetLabel: row.target?.label || shortId(row.targetId), action, actionLabel, tone })
  const actions: PendingAction[] = []
  if (row.status === 'OPEN') actions.push(base('PROCESSING', '标记处理中'))
  if (!['RESOLVED', 'REJECTED'].includes(row.status)) {
    actions.push(base('RESOLVED', '处理并结案'))
    actions.push(base('REJECTED', '驳回举报', 'danger'))
  }
  return actions
}

export function accessSummary(access: UserRow['recentAccess'][number]) {
  const platform = access.platform.toLowerCase() === 'weapp' ? '微信小程序' : ['h5', 'web', 'campus'].includes(access.platform.toLowerCase()) ? '浏览器' : access.platform
  const device = access.device?.toLowerCase()
  const deviceName = device === 'phone' || device === 'mobile' || device === 'weapp' ? '手机' : device === 'tablet' ? '平板' : device === 'desktop' || device === 'pc' ? '电脑' : '设备未知'
  return `${platform} · ${deviceName}`
}

function Status({ value, label, subtle = false }: { value: string; label?: string; subtle?: boolean }) {
  return <span className={`status status-${value.toLowerCase().replace('_', '-')} ${subtle ? 'subtle' : ''}`}>{label || labels[value] || value}</span>
}

function ErrorBanner({ message }: { message: string }) { return <div className="error-banner"><AlertTriangle size={18} /><span>{message}</span></div> }
function EmptyState() { return <div className="empty-state"><ClipboardList size={30} /><strong>没有符合条件的记录</strong><span>尝试调整筛选条件或稍后刷新。</span></div> }
function LoadingRows() { return <div className="loading-card"><span className="spinner" /><p>正在读取治理数据…</p></div> }
function messageOf(cause: unknown) { return cause instanceof Error ? cause.message : '操作失败，请稍后重试' }
function dateTime(value: string) { return new Date(value).toLocaleString('zh-CN', { hour12: false }) }
function shortId(value: string, length = 8) { return value.length > length ? `${value.slice(0, length)}…` : value }
