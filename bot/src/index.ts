import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import WebSocket from 'ws'
import { OfficialQQClient, type OfficialQQEvent } from './official-qq.js'

type Overview = {
  date: string
  inventory: { total: number; active: number; sold: number; pendingReview: number }
  today: { submitted: number; approved: number; sold: number; requests: number; visitors: number; trafficObserved: boolean }
}
type PendingItem = { id: string; title: string; author: string; isbn: string; campus: string; createdAt: string; seller: { nickname: string } }
type State = { pendingIds: string[]; groupOpenIds: string[]; initialized?: boolean; lastReportDate?: string }

const apiBase = (process.env.BITERSTORE_API_URL || 'http://api:3100/api/v1').replace(/\/$/, '')
const apiToken = process.env.BOT_API_TOKEN?.trim() || ''
const qqAppId = process.env.QQ_APP_ID?.trim() || ''
const qqAppSecret = process.env.QQ_APP_SECRET?.trim() || ''
const configuredGroupOpenIds = (process.env.QQ_GROUP_OPEN_IDS || '').split(',').map((value) => value.trim()).filter(Boolean)
const oneBotUrl = process.env.ONEBOT_WS_URL?.trim() || ''
const oneBotToken = process.env.ONEBOT_ACCESS_TOKEN?.trim()
const groupIds = (process.env.QQ_GROUP_IDS || '').split(',').map((value) => value.trim()).filter(Boolean)
const pollInterval = Math.max(15_000, Number(process.env.BOT_POLL_INTERVAL_MS || 60_000))
const reportHour = Math.min(23, Math.max(0, Number(process.env.BOT_REPORT_HOUR || 20)))
const reportMinute = Math.min(59, Math.max(0, Number(process.env.BOT_REPORT_MINUTE || 0)))
const stateFile = process.env.BOT_STATE_FILE || '/data/state.json'
const notifyExisting = process.env.BOT_NOTIFY_EXISTING_ON_START === 'true'
const adminBase = (process.env.BITERSTORE_ADMIN_URL || '/admin').trim().replace(/\/$/, '')

let state: State = { pendingIds: [], groupOpenIds: [] }
let socket: WebSocket | undefined
let socketReady: Promise<void> | undefined
let echo = 0
const official = qqAppId && qqAppSecret ? new OfficialQQClient(qqAppId, qqAppSecret, (event) => handleOfficialEvent(event)) : undefined

async function loadState() {
  try {
    const stored = JSON.parse(await readFile(stateFile, 'utf8')) as Partial<State>
    const pendingIds = Array.isArray(stored.pendingIds) ? stored.pendingIds.map(String) : []
    state = {
      pendingIds,
      groupOpenIds: Array.isArray(stored.groupOpenIds) ? stored.groupOpenIds.map(String) : [],
      // State files created before the initialized flag already had a cursor if
      // they had observed a queue, so preserve that behavior after upgrading.
      initialized: typeof stored.initialized === 'boolean' ? stored.initialized : pendingIds.length > 0,
      lastReportDate: typeof stored.lastReportDate === 'string' ? stored.lastReportDate : undefined
    }
  } catch {
    // A first run or a cleared volume starts with an empty notification cursor.
  }
}

async function saveState() {
  await mkdir(dirname(stateFile), { recursive: true })
  await writeFile(stateFile, JSON.stringify(state, null, 2), 'utf8')
}

async function api<T>(path: string): Promise<T> {
  if (!apiToken) throw new Error('BOT_API_TOKEN is not configured')
  const response = await fetch(`${apiBase}${path}`, { headers: { Authorization: `Bearer ${apiToken}` } })
  const body = await response.json().catch(() => ({})) as T & { message?: string }
  if (!response.ok) throw new Error(body.message || `BITerStore API ${response.status}`)
  return body as T
}

function currentShanghaiDate() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
}

function formatOverview(data: Overview) {
  const traffic = data.today.trafficObserved ? `今日访问 ${data.today.visitors} 人 / 请求 ${data.today.requests} 次` : '今日访问数据暂未观测到'
  return [
    `BITerStore 今日简报（${data.date}）`,
    `在售 ${data.inventory.active} 本｜待审核 ${data.inventory.pendingReview} 条｜累计商品 ${data.inventory.total} 条`,
    `今日提交 ${data.today.submitted} 条｜通过 ${data.today.approved} 条｜售出 ${data.today.sold} 条`,
    traffic
  ].join('\n')
}

function formatPending(item: PendingItem) {
  const seller = item.seller?.nickname || '未知卖家'
  return [`有新的商品待审核`, `书名：${item.title}`, `作者：${item.author || '未填写'}`, `卖家：${seller}`, `校区：${item.campus || '未设置'}`, `ISBN：${item.isbn || '未填写'}`, `后台：${adminBase}/listings/${item.id}`].join('\n')
}

function sendAction(action: string, params: Record<string, unknown>) {
  return new Promise<void>((resolve, reject) => {
    if (!socket || socket.readyState !== WebSocket.OPEN) return reject(new Error('OneBot websocket is not connected'))
    socket.send(JSON.stringify({ action, params, echo: String(++echo) }), (error) => error ? reject(error) : resolve())
  })
}

function officialTargets(target?: string) {
  if (target) return [target]
  return configuredGroupOpenIds.length ? configuredGroupOpenIds : state.groupOpenIds
}

async function sendGroup(text: string, target?: string) {
  if (official) {
    const targets = officialTargets(target)
    if (!targets.length) {
      console.warn('[qq-bot] no group_openid is known yet; mention the bot in the target group once')
      return
    }
    await Promise.all(targets.map((groupOpenId) => official.sendGroupMessage(groupOpenId, text)))
    return
  }
  if (!groupIds.length) return
  await ensureSocket()
  await Promise.all(groupIds.map((groupId) => sendAction('send_group_msg', { group_id: Number(groupId), message: text })))
}

function connectSocket() {
  if (!oneBotUrl) throw new Error('ONEBOT_WS_URL is not configured')
  const headers = oneBotToken ? { Authorization: `Bearer ${oneBotToken}` } : undefined
  const next = new WebSocket(oneBotUrl, { headers })
  socket = next
  socketReady = new Promise<void>((resolve, reject) => {
    next.once('open', () => resolve())
    next.once('error', reject)
  }).catch((error) => {
    if (socket === next) socket = undefined
    throw error
  })
  next.on('message', (raw) => { void handleEvent(raw.toString()).catch((error) => console.error('[qq-bot] event error', error)) })
  next.on('close', () => {
    if (socket === next) {
      socket = undefined
      socketReady = undefined
    }
  })
  return socketReady
}

async function ensureSocket() {
  if (socket?.readyState === WebSocket.OPEN) return
  if (!socketReady) socketReady = connectSocket()
  try { await socketReady } catch { socketReady = undefined; throw new Error('OneBot websocket connection failed') }
}

async function reportOverview() {
  const overview = await api<Overview>('/bot/overview')
  await sendGroup(formatOverview(overview))
}

async function reportOverviewTo(groupOpenId: string) {
  const overview = await api<Overview>('/bot/overview')
  await sendGroup(formatOverview(overview), groupOpenId)
}

async function reportPending() {
  const pending = await api<{ items: PendingItem[]; total: number }>('/bot/pending')
  if (!pending.total) return sendGroup('当前没有待审核商品。')
  const names = pending.items.slice(0, 8).map((item, index) => `${index + 1}. ${item.title}（${item.seller?.nickname || '未知卖家'}）`)
  await sendGroup(`当前待审核 ${pending.total} 条\n${names.join('\n')}${pending.total > names.length ? `\n还有 ${pending.total - names.length} 条未展开` : ''}`)
}

async function reportPendingTo(groupOpenId: string) {
  const pending = await api<{ items: PendingItem[]; total: number }>('/bot/pending')
  if (!pending.total) return sendGroup('当前没有待审核商品。', groupOpenId)
  const names = pending.items.slice(0, 8).map((item, index) => `${index + 1}. ${item.title}（${item.seller?.nickname || '未知卖家'}）`)
  await sendGroup(`当前待审核 ${pending.total} 条\n${names.join('\n')}${pending.total > names.length ? `\n还有 ${pending.total - names.length} 条未展开` : ''}`, groupOpenId)
}

async function pollPending() {
  const pending = await api<{ items: PendingItem[] }>('/bot/pending')
  const ids = pending.items.map((item) => item.id)
  const known = new Set(state.pendingIds)
  const fresh = pending.items.filter((item) => !known.has(item.id))
  if (!state.initialized) {
    state.initialized = true
    if (!notifyExisting) {
      state.pendingIds = ids
      await saveState()
      return
    }
  }
  for (const item of fresh) await sendGroup(formatPending(item))
  state.pendingIds = ids
  await saveState()
}

async function handleEvent(raw: string) {
  let event: { post_type?: string; message_type?: string; group_id?: number; message?: string | Array<{ type?: string; data?: { text?: string } }> }
  try { event = JSON.parse(raw) as typeof event } catch { return }
  if (event.post_type !== 'message' || event.message_type !== 'group' || !event.group_id) return
  if (!groupIds.includes(String(event.group_id))) return
  const text = typeof event.message === 'string' ? event.message : (event.message || []).filter((item) => item.type === 'text').map((item) => item.data?.text || '').join('').trim()
  if (text === '/今日' || text === '/今日数据') return reportOverview()
  if (text === '/待审核') return reportPending()
}

async function handleOfficialEvent(event: OfficialQQEvent) {
  const type = event.t || ''
  const data = event.d || {}
  const groupOpenId = typeof data.group_openid === 'string' ? data.group_openid : ''
  const allowedGroup = configuredGroupOpenIds.length === 0 || configuredGroupOpenIds.includes(groupOpenId)
  if (groupOpenId && allowedGroup && (type === 'GROUP_ADD_ROBOT' || type === 'GROUP_AT_MESSAGE_CREATE' || type === 'GROUP_MESSAGE_CREATE')) {
    if (!state.groupOpenIds.includes(groupOpenId)) {
      state.groupOpenIds.push(groupOpenId)
      await saveState()
      console.log('[qq-bot] discovered an official QQ group')
    }
  }
  if (!groupOpenId || (configuredGroupOpenIds.length > 0 && !configuredGroupOpenIds.includes(groupOpenId))) return
  if (type !== 'GROUP_AT_MESSAGE_CREATE' && type !== 'GROUP_MESSAGE_CREATE') return
  const text = String(data.content || '').trim()
  if (text === '/今日' || text === '/今日数据') return reportOverviewTo(groupOpenId)
  if (text === '/待审核') return reportPendingTo(groupOpenId)
}

async function tick() {
  try {
    await pollPending()
    const now = new Date()
    const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Shanghai', hour: 'numeric', minute: 'numeric', hour12: false }).formatToParts(now)
    const hour = Number(parts.find((part) => part.type === 'hour')?.value || -1)
    const minute = Number(parts.find((part) => part.type === 'minute')?.value || -1)
    const date = currentShanghaiDate()
    if (hour === reportHour && minute >= reportMinute && state.lastReportDate !== date) {
      await reportOverview()
      state.lastReportDate = date
      await saveState()
    }
  } catch (error) {
    console.error('[qq-bot] tick failed', error)
  }
}

async function main() {
  await loadState()
  if (official) void official.start().catch((error) => console.error('[qq-bot] official connection failed:', error.message))
  else if (!oneBotUrl) console.warn('[qq-bot] QQ_APP_ID/QQ_APP_SECRET or ONEBOT_WS_URL is not configured; API polling will continue but messages cannot be sent')
  else void ensureSocket().catch((error) => console.error('[qq-bot] initial connection failed:', error.message))
  await tick()
  setInterval(() => { void tick() }, pollInterval)
}

void main().catch((error) => { console.error('[qq-bot] fatal:', error); process.exitCode = 1 })
