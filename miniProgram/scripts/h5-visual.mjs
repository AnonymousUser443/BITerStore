import fs from 'node:fs/promises'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { root } from './weapp-env.mjs'

const preview = process.env.BITERSTORE_H5_URL || 'http://127.0.0.1:4173'
const ownsPreview = !process.env.BITERSTORE_H5_URL
const artifactDir = process.env.BITERSTORE_H5_ARTIFACT_DIR || path.resolve(root, '..', 'qa-artifacts', 'h5-actual')
const profileDir = await fs.mkdtemp(path.join(os.tmpdir(), 'biterstore-h5-cdp-'))
const distDir = path.join(root, 'dist')
const browserCandidates = [
  process.env.CHROME_PATH,
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
].filter(Boolean)
const qaProfile = { id: 'qa-user', nickname: '北理测试同学', avatarUrl: null, campus: '良乡', bio: '用于本地视觉验收的确定性账号。', role: 'USER', status: 'ACTIVE', campusStatus: 'VERIFIED', createdAt: '2026-08-28T00:00:00.000Z', wechatBound: false }
const qaSeller = { id: 'qa-seller', nickname: '校园书友', avatarUrl: null, campus: '中关村', campusStatus: 'VERIFIED', bio: '教材循环使用。' }
const qaListing = { id: 'math-7', title: '高等数学（第七版）上册', author: '同济大学数学系', isbn: '9787040396638', category: '教材教辅', course: '高等数学', priceCents: 2800, originalPriceCents: 4980, condition: '九成新', campus: '良乡', description: '适合课程学习和期末复习，书页整洁。', status: 'ACTIVE', sellerId: qaSeller.id, seller: qaSeller, createdAt: '2026-08-28T00:00:00.000Z', tags: ['教材', '期末复习'], images: [], version: 1 }
function apiFixture(pathname, method = 'GET') {
  if (!pathname.startsWith('/api/v1/')) return null
  if (pathname === '/api/v1/me' && method === 'GET') return { status: 200, body: qaProfile }
  if (pathname === '/api/v1/auth/refresh' && method === 'POST') return { status: 200, body: { expiresIn: 900, user: qaProfile } }
  if (pathname === '/api/v1/listings/favorites/mine') return { status: 200, body: [qaListing] }
  if (pathname === '/api/v1/listings/mine/all') return { status: 200, body: { items: [qaListing], nextCursor: null } }
  if (pathname === '/api/v1/listings/math-7') return { status: 200, body: qaListing }
  if (pathname === '/api/v1/listings') return { status: 200, body: { items: [qaListing], nextCursor: null } }
  if (pathname === '/api/v1/conversations/thread-lin/messages') return { status: 200, body: { items: [{ id: '1', senderId: qaSeller.id, content: '这本书还在，可以校内面交。', createdAt: '2026-08-28T08:00:00.000Z' }], nextCursor: '1' } }
  if (pathname === '/api/v1/conversations') return { status: 200, body: [{ id: 'thread-lin', listingId: qaListing.id, sellerId: qaSeller.id, lastMessageAt: '2026-08-28T08:00:00.000Z', unread: 1, members: [{ userId: qaProfile.id, user: qaProfile }, { userId: qaSeller.id, user: qaSeller }], messages: [{ id: '1', senderId: qaSeller.id, content: '这本书还在，可以校内面交。', createdAt: '2026-08-28T08:00:00.000Z' }] }] }
  if (pathname === '/api/v1/notifications') return { status: 200, body: [{ id: 'notice-comment', type: 'comment', title: '评论与回复', body: '校园书友回复了你的留言', readAt: null, createdAt: '2026-08-28T08:00:00.000Z' }] }
  return { status: 404, body: { message: `未配置本地 QA 接口: ${method} ${pathname}` } }
}
const targets = [
  ['welcome-390', 390, 900, '/'],
  ['onboarding-390', 390, 900, '/onboarding'],
  ['login-390', 390, 900, '/login'],
  ['login-1280', 1280, 900, '/login'],
  ['home-360', 360, 900, '/home'],
  ['search-390', 390, 900, '/search'],
  ['publish-430', 430, 900, '/publish'],
  ['messages-390', 390, 900, '/messages'],
  ['notification-390', 390, 900, '/messages/notifications/comment'],
  ['chat-390', 390, 900, '/messages/thread-lin'],
  ['detail-390', 390, 900, '/books/math-7'],
  ['favorites-390', 390, 900, '/favorites'],
  ['my-listings-390', 390, 900, '/my-listings'],
  ['states-390', 390, 900, '/states'],
  ['unavailable-390', 390, 900, '/states/unavailable'],
  ['home-820', 820, 1000, '/home'],
  ['profile-1280', 1280, 900, '/profile']
]

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
async function findBrowserExecutable() {
  for (const candidate of browserCandidates) {
    try { await fs.access(candidate); return candidate } catch { /* try the next Chromium browser */ }
  }
  throw new Error(`未找到 Chrome/Edge；已检查: ${browserCandidates.join(', ')}`)
}
const mimeTypes = new Map([
  ['.css', 'text/css; charset=utf-8'], ['.html', 'text/html; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'], ['.json', 'application/json; charset=utf-8'],
  ['.png', 'image/png'], ['.svg', 'image/svg+xml'], ['.webp', 'image/webp']
])
async function startPreviewServer() {
  const url = new URL(preview)
  if (!['127.0.0.1', 'localhost'].includes(url.hostname)) throw new Error(`默认视觉服务必须绑定本机地址: ${preview}`)
  const indexPath = path.join(distDir, 'index.html')
  await fs.access(indexPath)
  const server = http.createServer(async (request, response) => {
    try {
      const requestUrl = new URL(request.url || '/', preview)
      const requestPath = decodeURIComponent(requestUrl.pathname)
      const fixture = apiFixture(requestPath, request.method)
      if (fixture) {
        response.writeHead(fixture.status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' })
        response.end(JSON.stringify(fixture.body))
        return
      }
      const relativePath = requestPath.replace(/^\/+/, '')
      const candidate = path.resolve(distDir, relativePath || 'index.html')
      const insideDist = candidate === distDir || candidate.startsWith(`${distDir}${path.sep}`)
      let target = insideDist ? candidate : indexPath
      const stat = await fs.stat(target).catch(() => null)
      if (!stat?.isFile()) target = indexPath
      const body = await fs.readFile(target)
      response.writeHead(200, { 'Content-Type': mimeTypes.get(path.extname(target)) || 'application/octet-stream', 'Cache-Control': 'no-store' })
      response.end(body)
    } catch (error) {
      response.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' })
      response.end(error instanceof Error ? error.message : String(error))
    }
  })
  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(Number(url.port || 80), url.hostname, resolve)
  })
  return server
}
async function waitForPreview() {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try { const response = await fetch(preview); if (response.ok && (await response.text()).toLowerCase().includes('<!doctype html>')) return } catch { /* preview is still starting */ }
    await delay(100)
  }
  throw new Error(`H5 preview unavailable: ${preview}`)
}
async function waitForEndpoint(url) {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    try { const response = await fetch(url); if (response.ok) return response } catch { /* Chrome is starting */ }
    await delay(100)
  }
  throw new Error(`Chrome debugging endpoint unavailable: ${url}`)
}

class CdpClient {
  constructor(url, onEvent = () => undefined) {
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

await fs.mkdir(artifactDir, { recursive: true })
await fs.mkdir(profileDir, { recursive: true })
const browserExecutable = await findBrowserExecutable()
const previewServer = ownsPreview ? await startPreviewServer() : undefined
await waitForPreview()
const browser = spawn(browserExecutable, ['--headless=new', '--no-first-run', '--no-sandbox', '--disable-gpu', '--disable-gpu-sandbox', '--use-angle=swiftshader', '--hide-scrollbars', '--remote-allow-origins=*', '--remote-debugging-port=9333', `--user-data-dir=${profileDir}`, 'about:blank'], { windowsHide: true, stdio: 'ignore' })
let client
const diagnostics = []
const pages = []
try {
  await waitForEndpoint('http://127.0.0.1:9333/json/version')
  const tabResponse = await fetch(`http://127.0.0.1:9333/json/new?${encodeURIComponent(`${preview}/`)}`, { method: 'PUT' })
  const tab = await tabResponse.json()
  client = new CdpClient(tab.webSocketDebuggerUrl, (message) => {
    if (message.method === 'Runtime.exceptionThrown') diagnostics.push({ type: 'exception', text: message.params.exceptionDetails?.text || 'Runtime exception' })
    if (message.method === 'Runtime.consoleAPICalled' && ['error', 'warning'].includes(message.params.type)) diagnostics.push({ type: message.params.type, text: message.params.args?.map((arg) => arg.value || arg.description).join(' ') })
  })
  await client.send('Page.enable')
  await client.send('Runtime.enable')
  await client.send('Storage.clearDataForOrigin', { origin: preview, storageTypes: 'all' })
  for (const [name, width, height, route] of targets) {
    await client.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: width < 700 })
    const loaded = client.once('Page.loadEventFired')
    await client.send('Page.navigate', { url: `${preview}${route}` })
    await loaded
    await delay(750)
    await client.send('Runtime.evaluate', { expression: `window.scrollTo(0, 0); document.querySelectorAll('.taro_router, .taro_page, .content-scroll').forEach((element) => { element.scrollTop = 0 })` })
    await delay(100)
    if (name === 'welcome-390') {
      await client.send('Runtime.evaluate', { expression: `document.querySelector('#e2e-modal-close')?.click()` })
      await delay(250)
    }
    const pageState = await client.send('Runtime.evaluate', { expression: `(() => { const shell = document.querySelector('.phone-shell'); const selectors = ['.page-title','.primary-button','.welcome-title','.login-hero h1','.login-card','.profile-badges','.hero-card','.search-box','.category-chips .chip','.quick-filters > *','.listing-card','.detail-gallery','.detail-gallery .book-cover','.state-grid taro-button-core','.state-grid taro-image-core','.inline-state taro-image-core','.full-state .state-image','.chat-composer']; const measure = element => { const box = element.getBoundingClientRect(); const style = getComputedStyle(element); const child = element.querySelector(':scope > img'); const childBox = child?.getBoundingClientRect(); return { x: Math.round(box.x), y: Math.round(box.y), width: Math.round(box.width), height: Math.round(box.height), fontSize: style.fontSize, lineHeight: style.lineHeight, padding: style.padding, overflow: style.overflow, objectFit: style.objectFit, transform: style.transform, child: childBox ? { x: Math.round(childBox.x), y: Math.round(childBox.y), width: Math.round(childBox.width), height: Math.round(childBox.height), objectFit: getComputedStyle(child).objectFit, transform: getComputedStyle(child).transform } : null }; }; const metrics = Object.fromEntries(selectors.map(selector => [selector, document.querySelector(selector) ? measure(document.querySelector(selector)) : null])); return { url: location.href, text: document.body.innerText, html: document.body.innerHTML.slice(0, 500), metrics, shell: shell ? { className: shell.className, display: getComputedStyle(shell).display, visibility: getComputedStyle(shell).visibility, text: shell.innerText.slice(0, 160) } : null } })()`, returnByValue: true })
    pages.push({ name, url: pageState.result.value.url, textLength: pageState.result.value.text.length, shellClass: pageState.result.value.shell?.className || null, metrics: pageState.result.value.metrics })
    if (!pageState.result.value.shell || pageState.result.value.text.trim().length === 0) diagnostics.push({ type: 'blank-page', text: `${name}: ${pageState.result.value.url}` })
    const result = await client.send('Page.captureScreenshot', { format: 'png', fromSurface: true })
    await fs.writeFile(path.join(artifactDir, `${name}.png`), Buffer.from(result.data, 'base64'))
    if (name === 'profile-1280') {
      const profileCheck = await client.send('Runtime.evaluate', { expression: `(() => { const clipped = [...document.querySelectorAll('.profile-menu')].flatMap(menu => { const boundary = menu.getBoundingClientRect(); return [...menu.querySelectorAll(':scope > button')].filter(button => button.getBoundingClientRect().bottom > boundary.bottom + 1).map(button => button.innerText.trim()) }); document.querySelector('[aria-label="查看消息通知"]')?.click(); return { clipped } })()`, returnByValue: true })
      if (profileCheck.result.value.clipped.length) diagnostics.push({ type: 'clipped-profile-actions', text: profileCheck.result.value.clipped.join(', ') })
      await delay(250)
      const notificationPath = await client.send('Runtime.evaluate', { expression: 'location.pathname', returnByValue: true })
      if (notificationPath.result.value !== '/messages') diagnostics.push({ type: 'inactive-header-control', text: `通知按钮未进入 /messages，当前 ${notificationPath.result.value}` })
    }
  }
  console.log(JSON.stringify({ ok: diagnostics.length === 0, artifactDir, viewports: targets.map(([, width, height]) => `${width}x${height}`), pages, diagnostics }))
  if (diagnostics.length) process.exitCode = 1
} finally {
  try { await client?.send('Browser.close') } catch { /* browser may already be closing */ }
  client?.close()
  if (!browser.killed) browser.kill()
  await Promise.race([
    new Promise((resolve) => browser.once('exit', resolve)),
    delay(2000)
  ])
  if (previewServer) await new Promise((resolve) => previewServer.close(resolve))
  await fs.rm(profileDir, { recursive: true, force: true })
}
