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
  ['welcome-320', 320, 700, '/'],
  ['welcome-390', 390, 900, '/'],
  ['welcome-768', 768, 1024, '/'],
  ['onboarding-390', 390, 900, '/onboarding'],
  ['login-390', 390, 900, '/login'],
  ['login-1280', 1280, 900, '/login'],
  ['home-320', 320, 700, '/home'],
  ['home-360', 360, 900, '/home'],
  ['home-480', 480, 900, '/home'],
  ['home-600', 600, 900, '/home'],
  ['home-768', 768, 1024, '/home'],
  ['home-landscape-844', 844, 390, '/home'],
  ['home-1024', 1024, 768, '/home'],
  ['home-1440', 1440, 900, '/home'],
  ['home-1920', 1920, 1080, '/home'],
  ['search-320', 320, 700, '/search'],
  ['search-390', 390, 900, '/search'],
  ['search-600', 600, 900, '/search'],
  ['search-768', 768, 1024, '/search'],
  ['search-1024', 1024, 768, '/search'],
  ['search-1440', 1440, 900, '/search'],
  ['publish-320', 320, 700, '/publish'],
  ['publish-430', 430, 900, '/publish'],
  ['publish-600', 600, 900, '/publish'],
  ['publish-768', 768, 1024, '/publish'],
  ['publish-1440', 1440, 900, '/publish'],
  ['messages-320', 320, 700, '/messages'],
  ['messages-390', 390, 900, '/messages'],
  ['messages-600', 600, 900, '/messages'],
  ['messages-768', 768, 1024, '/messages'],
  ['messages-1440', 1440, 900, '/messages'],
  ['notification-390', 390, 900, '/messages/notifications/comment'],
  ['notification-768', 768, 1024, '/messages/notifications/comment'],
  ['chat-320', 320, 700, '/messages/thread-lin'],
  ['chat-390', 390, 900, '/messages/thread-lin'],
  ['chat-768', 768, 1024, '/messages/thread-lin'],
  ['chat-1440', 1440, 900, '/messages/thread-lin'],
  ['detail-390', 390, 900, '/books/math-7'],
  ['detail-600', 600, 900, '/books/math-7'],
  ['detail-768', 768, 1024, '/books/math-7'],
  ['detail-1024', 1024, 768, '/books/math-7'],
  ['detail-1440', 1440, 900, '/books/math-7'],
  ['favorites-390', 390, 900, '/favorites'],
  ['my-listings-390', 390, 900, '/my-listings'],
  ['states-390', 390, 900, '/states'],
  ['states-600', 600, 900, '/states'],
  ['states-1440', 1440, 900, '/states'],
  ['unavailable-390', 390, 900, '/states/unavailable'],
  ['profile-600', 600, 900, '/profile'],
  ['profile-1024', 1024, 768, '/profile'],
  ['profile-1280', 1280, 900, '/profile'],
  ['profile-1600', 1600, 1000, '/profile']
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
  const layoutProbe = `(() => {
    const shell = document.querySelector('.phone-shell')
    const selectors = ['.page-title','.primary-button','.welcome-title','.login-hero h1','.login-card','.profile-badges','.hero-card','.search-box','.category-chips .chip','.quick-filters > *','.listing-card','.detail-gallery','.detail-gallery .book-cover','.state-grid taro-button-core','.state-grid taro-image-core','.inline-state taro-image-core','.full-state .state-image','.chat-composer']
    const measure = element => {
      const box = element.getBoundingClientRect()
      const style = getComputedStyle(element)
      const child = element.querySelector(':scope > img')
      const childBox = child?.getBoundingClientRect()
      return { x: Math.round(box.x), y: Math.round(box.y), right: Math.round(box.right), bottom: Math.round(box.bottom), width: Math.round(box.width), height: Math.round(box.height), fontSize: style.fontSize, lineHeight: style.lineHeight, padding: style.padding, overflow: style.overflow, objectFit: style.objectFit, transform: style.transform, child: childBox ? { x: Math.round(childBox.x), y: Math.round(childBox.y), width: Math.round(childBox.width), height: Math.round(childBox.height), objectFit: getComputedStyle(child).objectFit, transform: getComputedStyle(child).transform } : null }
    }
    const gridColumns = selector => {
      const element = document.querySelector(selector)
      if (!element) return 0
      const columns = getComputedStyle(element).gridTemplateColumns
      return columns && columns !== 'none' ? columns.trim().split(/\\s+/).length : 0
    }
    const content = document.querySelector('.content-scroll')
    const nav = document.querySelector('.bottom-nav')
    const metrics = Object.fromEntries(selectors.map(selector => [selector, document.querySelector(selector) ? measure(document.querySelector(selector)) : null]))
    const shellBox = shell?.getBoundingClientRect()
    return {
      url: location.href,
      text: document.body.innerText,
      html: document.body.innerHTML.slice(0, 500),
      viewport: { width: innerWidth, height: innerHeight },
      document: { scrollWidth: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth), clientWidth: document.documentElement.clientWidth },
      metrics,
      shell: shell ? { className: shell.className, display: getComputedStyle(shell).display, visibility: getComputedStyle(shell).visibility, text: shell.innerText.slice(0, 160), x: Math.round(shellBox.x), right: Math.round(shellBox.right), width: Math.round(shellBox.width), clientWidth: shell.clientWidth, scrollWidth: shell.scrollWidth } : null,
      layout: {
        content: content ? measure(content) : null,
        contentClientWidth: content?.clientWidth || 0,
        contentScrollWidth: content?.scrollWidth || 0,
        contentPaddingLeft: content ? parseFloat(getComputedStyle(content).paddingLeft) : 0,
        nav: nav ? measure(nav) : null,
        bookColumns: gridColumns('.book-row'),
        listingColumns: gridColumns('.listing-stack'),
        notificationColumns: gridColumns('.notification-grid'),
        threadColumns: gridColumns('.thread-list'),
        stateColumns: gridColumns('.state-grid'),
        profileColumns: gridColumns('.profile-page .content-scroll')
      }
    }
  })()`
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
    const pageState = await client.send('Runtime.evaluate', { expression: layoutProbe, returnByValue: true })
    const state = pageState.result.value
    pages.push({ name, url: state.url, textLength: state.text.length, shellClass: state.shell?.className || null, viewport: state.viewport, shell: state.shell, layout: state.layout, metrics: state.metrics })
    if (!state.shell || state.text.trim().length === 0) diagnostics.push({ type: 'blank-page', text: `${name}: ${state.url}` })
    if (state.document.scrollWidth > state.viewport.width + 1) diagnostics.push({ type: 'horizontal-overflow', text: `${name}: document ${state.document.scrollWidth}px > viewport ${state.viewport.width}px` })
    if (state.shell && (state.shell.x < -1 || state.shell.right > state.viewport.width + 1)) diagnostics.push({ type: 'shell-outside-viewport', text: `${name}: shell ${state.shell.x}–${state.shell.right}px @ ${state.viewport.width}px` })
    if (width >= 480 && width < 700 && state.shell?.width < width - 40) diagnostics.push({ type: 'fixed-compact-canvas', text: `${name}: ${state.shell.width}px shell did not expand with ${width}px viewport` })
    if (state.layout.contentScrollWidth > state.layout.contentClientWidth + 2) diagnostics.push({ type: 'content-horizontal-overflow', text: `${name}: content ${state.layout.contentScrollWidth}px > ${state.layout.contentClientWidth}px` })
    if (state.layout.nav) {
      const landscapeRail = width >= 700 && width < 1024 && height <= 500
      if ((width >= 1024 || landscapeRail) && (state.layout.nav.width > 150 || state.layout.nav.height < 250)) diagnostics.push({ type: 'desktop-nav-orientation', text: `${name}: ${state.layout.nav.width}×${state.layout.nav.height}` })
      if (width < 1024 && !landscapeRail && (state.layout.nav.width < state.shell.width * .7 || state.layout.nav.height > 100)) diagnostics.push({ type: 'touch-nav-orientation', text: `${name}: ${state.layout.nav.width}×${state.layout.nav.height}` })
    }
    if (name.startsWith('search-') && width >= 560 && state.layout.listingColumns < 2) diagnostics.push({ type: 'search-grid-not-reflowed', text: `${name}: ${state.layout.listingColumns} column(s)` })
    if (name.startsWith('messages-') && width >= 700 && state.layout.notificationColumns < 3) diagnostics.push({ type: 'message-grid-not-reflowed', text: `${name}: ${state.layout.notificationColumns} column(s)` })
    if (name === 'profile-1600' && state.layout.profileColumns < 3) diagnostics.push({ type: 'wide-profile-not-reflowed', text: `${name}: ${state.layout.profileColumns} column(s)` })
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
