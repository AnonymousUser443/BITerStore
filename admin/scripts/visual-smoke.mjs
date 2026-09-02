import fs from 'node:fs/promises'
import http from 'node:http'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const dist = path.join(root, 'dist')
const artifactDir = path.join(root, 'qa-artifacts', 'visual')
const profileDir = path.join(root, 'qa-artifacts', `chrome-profile-${process.pid}`)
const chrome = process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
const debugPort = 9344
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const fixtureUser = {
  id: 'visual-user-1', nickname: '测试书友', campus: '良乡', role: 'USER', status: 'ACTIVE',
  campusStatus: 'VERIFIED', adminTotpEnabled: false, createdAt: '2026-09-01T08:00:00.000Z',
  updatedAt: '2026-09-01T08:00:00.000Z', _count: { listings: 3, reports: 1 }
}
const fixtures = {
  '/api/v1/admin/security/status': { user: { id: 'visual-admin', nickname: '平台管理员', role: 'SUPER_ADMIN', campusStatus: 'VERIFIED' }, totpEnabled: true },
  '/api/v1/admin/metrics': { users: 128, activeUsers: 121, newUsers: 14, listings: 356, activeListings: 219, newListings: 31, sold: 87, openReports: 3, generatedAt: '2026-09-02T03:30:00.000Z' },
  '/api/v1/admin/users': { items: [fixtureUser], total: 1, page: 1, pageSize: 20, pages: 1 },
  '/api/v1/admin/listings': { items: [{ id: 'visual-listing-1', title: '高等数学（第七版）上册', author: '同济大学数学系', isbn: '9787040396638', category: '教材教辅', priceCents: 1800, campus: '良乡', status: 'ACTIVE', moderationDecision: null, viewCount: 42, createdAt: '2026-09-01T09:30:00.000Z', seller: { id: 'seller-1', nickname: '北湖书友', status: 'ACTIVE' }, images: [], _count: { favorites: 7, conversations: 2 } }], total: 1, page: 1, pageSize: 20, pages: 1 },
  '/api/v1/admin/reports': { items: [{ id: 'visual-report-1', targetType: 'LISTING', targetId: 'visual-listing-1', reason: '商品描述与实物不符', evidence: '已提供聊天记录', status: 'OPEN', createdAt: '2026-09-02T01:20:00.000Z', updatedAt: '2026-09-02T01:20:00.000Z', reporter: { id: 'reporter-1', nickname: '认真同学' }, target: { label: '高等数学（第七版）上册', status: 'ACTIVE' } }], total: 1, page: 1, pageSize: 20, pages: 1 },
  '/api/v1/admin/audit-logs': { items: [{ id: '42', action: 'BLOCKED', resourceType: 'LISTING', resourceId: 'visual-listing-1', requestId: 'admin-visual-request', metadata: { reason: '示例违规处置' }, createdAt: '2026-09-02T02:00:00.000Z', actor: { id: 'visual-admin', nickname: '平台管理员', role: 'SUPER_ADMIN' } }], total: 1, page: 1, pageSize: 20, pages: 1 }
}
let listingIgnored = false

function sendJson(response, body) {
  response.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' })
  response.end(JSON.stringify(body))
}

const server = http.createServer(async (request, response) => {
  const pathname = new URL(request.url || '/', 'http://127.0.0.1').pathname
  if (pathname === '/api/v1/admin/listings') {
    const fixture = fixtures[pathname]
    return sendJson(response, listingIgnored ? { ...fixture, items: [], total: 0, pages: 1 } : fixture)
  }
  if (pathname === '/api/v1/admin/moderation-actions') {
    const chunks = []
    for await (const chunk of request) chunks.push(chunk)
    const body = JSON.parse(Buffer.concat(chunks).toString('utf8'))
    if (body.targetType === 'LISTING' && body.action === 'IGNORE') listingIgnored = true
    return sendJson(response, { ok: true, repeated: false })
  }
  const fixtureKey = Object.keys(fixtures).find((key) => pathname === key)
  if (fixtureKey) return sendJson(response, fixtures[fixtureKey])
  if (pathname === '/admin') { response.writeHead(302, { Location: '/admin/' }); return response.end() }
  const relative = pathname.replace(/^\/admin\/?/, '') || 'index.html'
  const target = path.resolve(dist, relative)
  if (!target.startsWith(`${dist}${path.sep}`) && target !== path.join(dist, 'index.html')) { response.writeHead(403); return response.end() }
  try {
    const content = await fs.readFile(target)
    const type = target.endsWith('.js') ? 'text/javascript' : target.endsWith('.css') ? 'text/css' : 'text/html'
    response.writeHead(200, { 'Content-Type': `${type}; charset=utf-8` })
    response.end(content)
  } catch {
    response.writeHead(404)
    response.end()
  }
})

async function waitForEndpoint(url) {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try { const response = await fetch(url); if (response.ok) return } catch { /* Chrome is starting. */ }
    await delay(100)
  }
  throw new Error(`Chrome debugging endpoint unavailable: ${url}`)
}

class CdpClient {
  constructor(url, onEvent) {
    this.nextId = 1
    this.pending = new Map()
    this.events = new Map()
    this.socket = new WebSocket(url)
    this.ready = new Promise((resolve, reject) => { this.socket.onopen = resolve; this.socket.onerror = reject })
    this.socket.onmessage = ({ data }) => {
      const message = JSON.parse(data)
      if (message.id) {
        const pending = this.pending.get(message.id)
        if (!pending) return
        this.pending.delete(message.id)
        return message.error ? pending.reject(new Error(message.error.message)) : pending.resolve(message.result)
      }
      onEvent(message)
      const listeners = this.events.get(message.method) || []
      this.events.delete(message.method)
      listeners.forEach((resolve) => resolve(message.params))
    }
  }
  async send(method, params = {}) {
    await this.ready
    const id = this.nextId++
    return new Promise((resolve, reject) => { this.pending.set(id, { resolve, reject }); this.socket.send(JSON.stringify({ id, method, params })) })
  }
  once(method) { return new Promise((resolve) => this.events.set(method, [...(this.events.get(method) || []), resolve])) }
  close() { this.socket.close() }
}

async function waitFor(client, expression) {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const result = await client.send('Runtime.evaluate', { expression, returnByValue: true })
    if (result.result.value) return
    await delay(100)
  }
  throw new Error(`Timed out waiting for ${expression}`)
}

await fs.mkdir(artifactDir, { recursive: true })
await fs.mkdir(profileDir, { recursive: true })
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
const address = server.address()
const preview = `http://127.0.0.1:${address.port}`
const browser = spawn(chrome, ['--headless=new', '--no-first-run', '--no-sandbox', '--disable-gpu', '--hide-scrollbars', '--remote-allow-origins=*', `--remote-debugging-port=${debugPort}`, `--user-data-dir=${profileDir}`, 'about:blank'], { windowsHide: true, stdio: 'ignore' })
const diagnostics = []
const pages = []
let client
try {
  await waitForEndpoint(`http://127.0.0.1:${debugPort}/json/version`)
  const tab = await fetch(`http://127.0.0.1:${debugPort}/json/new?about:blank`, { method: 'PUT' }).then((response) => response.json())
  client = new CdpClient(tab.webSocketDebuggerUrl, (message) => {
    if (message.method === 'Runtime.exceptionThrown') diagnostics.push({ type: 'exception', text: message.params.exceptionDetails?.text || 'Runtime exception' })
    if (message.method === 'Runtime.consoleAPICalled' && message.params.type === 'error') diagnostics.push({ type: 'console-error', text: message.params.args?.map((item) => item.value || item.description).join(' ') })
  })
  await client.send('Page.enable')
  await client.send('Runtime.enable')
  await client.send('Page.addScriptToEvaluateOnNewDocument', { source: `sessionStorage.setItem('biterstore-admin-token', 'visual-fixture')` })

  const targets = [
    ['dashboard-desktop', 1440, 900, 0, null],
    ['users-desktop-dialog', 1180, 820, 1, 'user'],
    ['listings-desktop-dialog', 1440, 760, 2, 'listing'],
    ['reports-mobile', 390, 844, 3, null],
    ['audit-tablet', 768, 900, 4, null]
  ]
  for (const [name, width, height, navIndex, dialogTrigger] of targets) {
    await client.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: width < 700 })
    const loaded = client.once('Page.loadEventFired')
    await client.send('Page.navigate', { url: `${preview}/admin/` })
    await loaded
    await waitFor(client, `Boolean(document.querySelector('.admin-shell'))`)
    if (navIndex > 0) {
      await client.send('Runtime.evaluate', { expression: `document.querySelectorAll('.sidebar nav button')[${navIndex}]?.click()` })
      await delay(400)
    }
    const beforeTableScroll = ['user', 'listing'].includes(dialogTrigger)
      ? await client.send('Runtime.evaluate', { expression: `document.querySelector('.table-card')?.scrollHeight || 0`, returnByValue: true }).then((result) => result.result.value)
      : null
    if (dialogTrigger) {
      const expression = dialogTrigger === 'listing'
        ? `document.querySelector('.listing-action-trigger')?.click()`
        : `document.querySelector('.user-action-trigger')?.click()`
      await client.send('Runtime.evaluate', { expression })
      await waitFor(client, `Boolean(document.querySelector('.action-dialog'))`)
      if (dialogTrigger === 'user') {
        await client.send('Runtime.evaluate', { expression: `document.querySelector('.action-choice-grid button')?.click()` })
        await waitFor(client, `Boolean(document.querySelector('.action-dialog textarea'))`)
      }
    }
    const state = await client.send('Runtime.evaluate', { expression: `(() => ({ text: document.body.innerText, clientWidth: document.documentElement.clientWidth, scrollWidth: document.documentElement.scrollWidth, navVisible: getComputedStyle(document.querySelector('.sidebar')).display !== 'none', dialog: Boolean(document.querySelector('.action-dialog')), tableScrollHeight: document.querySelector('.table-card')?.scrollHeight || 0, listingChoices: [...document.querySelectorAll('.action-dialog .dialog-actions button')].map((button) => button.textContent?.trim()), userChoices: [...document.querySelectorAll('.action-choice-grid button')].map((button) => button.textContent?.trim()), detailHref: document.querySelector('.listing-detail-link')?.getAttribute('href') || '', detailTarget: document.querySelector('.listing-detail-link')?.getAttribute('target') || '' }))()`, returnByValue: true })
    if (!state.result?.value) throw new Error(`Cannot inspect ${name}: ${state.exceptionDetails?.exception?.description || state.exceptionDetails?.text || 'unknown browser evaluation error'}`)
    const value = state.result.value
    if (!value.text.trim()) diagnostics.push({ type: 'blank-page', text: name })
    if (value.scrollWidth > value.clientWidth + 1) diagnostics.push({ type: 'horizontal-overflow', text: `${name}: ${value.scrollWidth} > ${value.clientWidth}` })
    if (!value.navVisible) diagnostics.push({ type: 'missing-navigation', text: name })
    if (dialogTrigger && !value.dialog) diagnostics.push({ type: 'missing-dialog', text: name })
    if (['user', 'listing'].includes(dialogTrigger) && value.tableScrollHeight !== beforeTableScroll) diagnostics.push({ type: 'table-scroll-changed', text: `${name}: ${beforeTableScroll} -> ${value.tableScrollHeight}` })
    if (dialogTrigger === 'user' && (value.userChoices.length < 3 || !value.userChoices.includes('封禁账号'))) diagnostics.push({ type: 'wrong-user-actions', text: `${name}: ${value.userChoices.join('|')}` })
    if (dialogTrigger === 'listing' && value.listingChoices.join('|') !== '忽略|违规屏蔽') diagnostics.push({ type: 'wrong-listing-actions', text: `${name}: ${value.listingChoices.join('|')}` })
    if (dialogTrigger === 'listing' && (value.detailHref !== '/books?id=visual-listing-1' || value.detailTarget !== '_blank')) diagnostics.push({ type: 'wrong-listing-detail-link', text: `${name}: ${value.detailHref} ${value.detailTarget}` })
    pages.push({ name, width, height, textLength: value.text.length, scrollWidth: value.scrollWidth, clientWidth: value.clientWidth, dialog: value.dialog })
    const screenshot = await client.send('Page.captureScreenshot', { format: 'png', fromSurface: true })
    await fs.writeFile(path.join(artifactDir, `${name}.png`), Buffer.from(screenshot.data, 'base64'))
    if (dialogTrigger === 'listing') {
      await client.send('Runtime.evaluate', { expression: `document.querySelector('.action-dialog .dialog-actions button')?.click()` })
      await waitFor(client, `!document.querySelector('.action-dialog') && Boolean(document.querySelector('.empty-state'))`)
      const ignored = await client.send('Runtime.evaluate', { expression: `document.body.innerText.includes('没有符合条件的记录')`, returnByValue: true })
      if (!ignored.result.value) diagnostics.push({ type: 'ignored-listing-remains', text: name })
    }
  }
  console.log(JSON.stringify({ ok: diagnostics.length === 0, artifactDir, pages, diagnostics }, null, 2))
  if (diagnostics.length) process.exitCode = 1
} finally {
  try { await client?.send('Browser.close') } catch { /* Browser may already be closed. */ }
  client?.close()
  if (browser.exitCode === null) browser.kill()
  await Promise.race([
    new Promise((resolve) => browser.once('exit', resolve)),
    delay(3000)
  ])
  server.close()
  await fs.rm(profileDir, { recursive: true, force: true, maxRetries: 8, retryDelay: 250 })
}
