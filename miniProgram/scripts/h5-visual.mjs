import fs from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { createServer } from 'node:http'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { root } from './weapp-env.mjs'
import { checkBackNavigation } from './h5-interaction-regressions.mjs'
import { checkAdminReview } from './admin-review-regression.mjs'

const preview = process.env.BITERSTORE_H5_URL || 'http://127.0.0.1:4173'
const browserCandidates = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe'
]
const chrome = process.env.CHROME_PATH || browserCandidates.find(existsSync)
const cdpPort = Number(process.env.BITERSTORE_CDP_PORT || 9347)
const artifactDir = process.env.BITERSTORE_H5_ARTIFACT_DIR || path.join(root, 'qa-artifacts', 'h5-actual')
const distDir = path.join(root, 'dist')
const profileDir = path.join(root, 'qa-artifacts', `chrome-cdp-profile-${process.pid}`)
const allTargets = [
  ['welcome-320', 320, 700, '/'],
  ['welcome-390', 390, 900, '/welcome'],
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
  ['home-1872-831', 1872, 831, '/home'],
  ['home-1920', 1920, 1080, '/home'],
  ['home-960-dpi2', 960, 540, '/home', 2],
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
  ['publish-2048', 2048, 1100, '/publish'],
  ['messages-320', 320, 700, '/messages'],
  ['messages-390', 390, 900, '/messages'],
  ['messages-600', 600, 900, '/messages'],
  ['messages-768', 768, 1024, '/messages'],
  ['messages-1440', 1440, 900, '/messages'],
  ['notification-390', 390, 900, '/notifications?type=comment'],
  ['notification-system-390', 390, 900, '/notifications?type=system'],
  ['notification-768', 768, 1024, '/messages/notifications/comment'],
  ['chat-320', 320, 700, '/chat?id=thread-lin'],
  ['chat-390', 390, 900, '/chat?id=thread-lin'],
  ['chat-768', 768, 1024, '/chat?id=thread-lin'],
  ['chat-1440', 1440, 900, '/chat?id=thread-lin'],
  ['detail-390', 390, 900, '/books?id=math-7'],
  ['detail-owner-review-390', 390, 900, '/books?id=qa-owned'],
  ['detail-guest-390', 390, 900, '/books?id=math-7&qa_guest=1'],
  ['detail-direct-390', 390, 900, '/books/math-7'],
  ['detail-600', 600, 900, '/books?id=math-7'],
  ['detail-768', 768, 1024, '/books?id=math-7'],
  ['detail-1024', 1024, 768, '/books?id=math-7'],
  ['detail-1440', 1440, 900, '/books?id=math-7'],
  ['home-390-short', 390, 667, '/home'],
  ['home-600-800', 600, 800, '/home'],
  ['detail-844-landscape', 844, 390, '/books?id=math-7'],
  ['favorites-390', 390, 900, '/favorites'],
  ['my-listings-390', 390, 900, '/my-listings'],
  ['states-390', 390, 900, '/states'],
  ['states-600', 600, 900, '/states'],
  ['states-1440', 1440, 900, '/states'],
  ['not-found-390', 390, 900, '/definitely-not-a-page'],
  ['unavailable-390', 390, 900, '/states?type=unavailable'],
  ['profile-600', 600, 900, '/profile'],
  ['feedback-390', 390, 900, '/feedback'],
  ['home-820', 820, 1000, '/home'],
  ['detail-1024-768', 1024, 768, '/books?id=math-7'],
  ['detail-1280-600', 1280, 600, '/books?id=math-7'],
  ['home-1280-720', 1280, 720, '/home'],
  ['home-1280-600', 1280, 600, '/home'],
  ['detail-1366-768', 1366, 768, '/books?id=math-7'],
  ['my-listings-1366-768', 1366, 768, '/my-listings'],
  ['profile-699', 699, 900, '/profile'],
  ['profile-700', 700, 900, '/profile'],
  ['profile-1023', 1023, 900, '/profile'],
  ['profile-1024', 1024, 900, '/profile'],
  ['profile-1280', 1280, 900, '/profile'],
  ['profile-1600', 1600, 1000, '/profile']
]
const requestedTargets = new Set((process.env.BITERSTORE_H5_TARGETS || '').split(',').map((value) => value.trim()).filter(Boolean))
const targets = requestedTargets.size ? allTargets.filter(([name]) => requestedTargets.has(name)) : allTargets

const expectedPageClass = {
  'publish-430': 'publish-page',
  'messages-390': 'messages-page',
  'notification-390': 'notification-detail-page',
  'chat-390': 'chat-page',
  'detail-guest-390': 'detail-page',
  'detail-owner-review-390': 'detail-page',
  'detail-direct-390': 'detail-page',
  'not-found-390': 'full-state',
  'favorites-390': 'simple-list-page',
  'my-listings-390': 'simple-list-page',
  'my-listings-1366-768': 'simple-list-page',
  'profile-699': 'profile-page',
  'profile-700': 'profile-page',
  'profile-1023': 'profile-page',
  'profile-1024': 'profile-page',
  'profile-1280': 'profile-page',
  'feedback-390': 'feedback-page'
}

const authenticatedFixture = `(() => {
  if (location.pathname.startsWith('/admin/')) return;
  const guest = new URL(location.href).searchParams.has('qa_guest');
  const user = {
    id: 'qa-student', studentNumber: '1120260001', nickname: '视觉巡检用户', avatarUrl: null,
    campus: '良乡', bio: '用于响应式页面巡检', role: 'USER', campusStatus: 'VERIFIED',
    status: 'ACTIVE', createdAt: '2026-08-29T08:00:00.000Z', wechatBound: true
  };
  const seller = { ...user, id: 'qa-seller', nickname: '巡检卖家', campus: null };
  const listing = {
    id: 'math-7', title: '高等数学（第七版）', author: '同济大学数学系', isbn: '9787040396638',
    category: '教材教辅', course: '', priceCents: 2800, originalPriceCents: 5680,
    condition: '九成新', campus: '良乡', description: '页面巡检用商品', status: 'ACTIVE',
    sellerId: seller.id, seller, createdAt: '2026-08-29T08:00:00.000Z', tags: ['教材'], images: [], version: 1
  };
  const ownedListing = { ...listing, id: 'qa-owned', title: '我的待审核商品', status: 'PENDING_REVIEW', sellerId: user.id, seller: user };
  const message = { id: '12', senderId: seller.id, content: '你好，这本书还在吗？', createdAt: '2026-08-29T08:30:00.000Z' };
  const conversation = {
    id: 'thread-lin', listingId: listing.id, listing, buyerId: user.id, sellerId: seller.id, lastMessageAt: '2026-08-29T08:30:00.000Z',
    unread: 1, members: [{ userId: user.id, user }, { userId: seller.id, user: seller }], messages: [message]
  };
  if (guest) {
    localStorage.removeItem('biterstore:v1:authenticated-sid');
    localStorage.removeItem('biterstore:v1:snapshot:profile');
  } else {
    localStorage.setItem('biterstore:v1:authenticated-sid', JSON.stringify(user.id));
    localStorage.setItem('biterstore:v1:snapshot:profile', JSON.stringify({
    id: user.id, studentNumber: user.studentNumber, name: user.nickname, campus: user.campus,
    verified: true, bio: user.bio, responseTime: '通常很快回复', avatarTone: 'sage'
    }));
  }
  localStorage.setItem('biterstore.ui-assets.bundle', '2026.08.24.11');
  const nativeFetch = window.fetch.bind(window);
  window.fetch = async (input, init = {}) => {
    const url = new URL(typeof input === 'string' ? input : input.url, location.origin);
    if (!url.pathname.startsWith('/api/v1/')) return nativeFetch(input, init);
    const path = url.pathname.slice('/api/v1'.length);
    const method = (init.method || (typeof input === 'string' ? 'GET' : input.method) || 'GET').toUpperCase();
    if (guest && (path === '/me' || path === '/auth/refresh')) {
      return new Response(JSON.stringify({ message: 'Unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
    }
    let body;
    if (path === '/me') body = user;
    else if (path === '/listings/favorites/mine') body = [listing];
    else if (path === '/listings/mine/all') body = { items: [ownedListing] };
    else if (path === '/listings/mine/qa-owned') body = ownedListing;
    else if (path === '/listings/qa-owned') return new Response(JSON.stringify({ message: '商品不存在' }), { status: 404, headers: { 'Content-Type': 'application/json' } });
    else if (path === '/listings' && method === 'GET') body = { items: [listing] };
    else if (path === '/conversations' && method === 'GET') body = [conversation];
    else if (path === '/conversations/thread-lin' && method === 'GET') body = conversation;
    else if (path === '/conversations/thread-lin/messages' && method === 'GET') body = { items: [message] };
    else if (path === '/blocks' && method === 'GET') body = [];
    else if (path === '/reports/mine') body = { items: [{ id: 'report-qa', targetType: 'LISTING', targetId: 'math-7', targetLabel: '商品《高等数学（第七版）》', reason: '商品描述与图片不符', status: 'RESOLVED', resolution: '已核实并下架相关商品。', createdAt: '2026-09-17T08:00:00.000Z', updatedAt: '2026-09-18T08:00:00.000Z' }], nextCursor: null };
    else if (path === '/notifications') body = [{
      id: 'qa-notification', type: 'COMMENT', title: '新的留言', body: '巡检消息',
      readAt: null, createdAt: '2026-08-29T08:30:00.000Z'
    }];
    else if (/^\\/listings\\/[^/]+$/.test(path) && method === 'GET') body = path.endsWith('/qa-owned') ? ownedListing : listing;
    else body = {};
    return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };
})();`

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const waitForLoad = (event, timeout = 5000) => Promise.race([event, delay(timeout)])
const trace = (label) => { if (process.env.BITERSTORE_H5_TRACE === '1') console.error(`[h5-visual] ${label}`) }
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
if (!chrome) throw new Error('找不到 Chrome 或 Edge；可通过 CHROME_PATH 指定 Chromium 浏览器')
let previewServer
if (!process.env.BITERSTORE_H5_URL) {
  const previewUrl = new URL(preview)
  const contentTypes = { '.css': 'text/css; charset=utf-8', '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.webp': 'image/webp' }
  previewServer = createServer(async (request, response) => {
    try {
      const pathname = decodeURIComponent(new URL(request.url || '/', preview).pathname)
      const redirects = [
        [/^\/books\/([A-Za-z0-9_-]+)$/, (match) => `/books?id=${encodeURIComponent(match[1])}`],
        [/^\/messages\/notifications\/(like|comment|system|follow)$/, (match) => `/notifications?type=${encodeURIComponent(match[1])}`],
        [/^\/messages\/([A-Za-z0-9_-]+)$/, (match) => `/chat?id=${encodeURIComponent(match[1])}`],
        [/^\/states\/([A-Za-z0-9_-]+)$/, (match) => `/states?type=${encodeURIComponent(match[1])}`]
      ]
      const redirect = redirects.map(([pattern, destination]) => {
        const match = pathname.match(pattern)
        return match ? destination(match) : null
      }).find(Boolean)
      if (redirect) {
        response.writeHead(302, { Location: redirect, 'Cache-Control': 'no-store' }).end()
        return
      }
      const relative = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '')
      const requestedFile = path.resolve(distDir, relative)
      if (requestedFile !== distDir && !requestedFile.startsWith(`${distDir}${path.sep}`)) {
        response.writeHead(403).end('Forbidden')
        return
      }
      const knownRoutes = new Set(['/', '/welcome', '/onboarding', '/login', '/home', '/search', '/category', '/books', '/publish', '/messages', '/notifications', '/chat', '/profile', '/profile/edit', '/feedback', '/favorites', '/my-listings', '/states'])
      let file = requestedFile
      let body
      try { body = await fs.readFile(file) } catch {
        if (!knownRoutes.has(pathname)) {
          response.writeHead(302, { Location: '/states?type=404', 'Cache-Control': 'no-store' }).end()
          return
        }
        file = path.join(distDir, 'index.html')
        body = await fs.readFile(file)
      }
      response.writeHead(200, { 'Content-Type': contentTypes[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' })
      response.end(body)
    } catch (error) {
      response.writeHead(500).end(error instanceof Error ? error.message : 'Preview server error')
    }
  })
  await new Promise((resolve, reject) => {
    previewServer.once('error', reject)
    previewServer.listen(Number(previewUrl.port || 80), previewUrl.hostname, resolve)
  })
}
const browser = spawn(chrome, ['--headless=new', '--no-first-run', '--no-default-browser-check', '--disable-extensions', '--disable-sync', '--disable-component-update', '--no-sandbox', '--disable-gpu', '--disable-gpu-sandbox', '--use-angle=swiftshader', '--remote-allow-origins=*', `--remote-debugging-port=${cdpPort}`, `--user-data-dir=${profileDir}`, 'about:blank'], { windowsHide: true, stdio: 'ignore' })
let client
const diagnostics = []
const pages = []
let dockMotion
try {
  await waitForEndpoint(`http://127.0.0.1:${cdpPort}/json/version`)
  const tabResponse = await fetch(`http://127.0.0.1:${cdpPort}/json/new?${encodeURIComponent(`${preview}/`)}`, { method: 'PUT' })
  const tab = await tabResponse.json()
  client = new CdpClient(tab.webSocketDebuggerUrl, (message) => {
    if (message.method === 'Runtime.exceptionThrown') diagnostics.push({ type: 'exception', text: message.params.exceptionDetails?.text || 'Runtime exception' })
    if (message.method === 'Runtime.consoleAPICalled' && ['error', 'warning'].includes(message.params.type)) diagnostics.push({ type: message.params.type, text: message.params.args?.map((arg) => arg.value || arg.description).join(' ') })
  })
  await client.send('Page.enable')
  await client.send('Runtime.enable')
  await client.send('Storage.clearDataForOrigin', { origin: preview, storageTypes: 'all' })
  await client.send('Page.addScriptToEvaluateOnNewDocument', { source: authenticatedFixture })
  for (const [name, width, height, route, requestedScale = 1] of targets) {
    trace(`target:${name}:start`)
    await client.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: requestedScale, mobile: width < 700 })
    const loaded = client.once('Page.loadEventFired')
    await client.send('Page.navigate', { url: `${preview}${route}` })
    await waitForLoad(loaded)
    await delay(750)
    await client.send('Runtime.evaluate', { expression: `window.scrollTo(0, 0); document.querySelectorAll('.taro_router, .taro_page, .content-scroll').forEach((element) => { element.scrollTop = 0 })` })
    await delay(100)
    if (name === 'welcome-390') {
      await client.send('Runtime.evaluate', { expression: `document.querySelector('#e2e-modal-close')?.click()` })
      await delay(250)
    }
    if (name === 'feedback-390') {
      await client.send('Runtime.evaluate', { expression: `document.querySelector('#e2e-feedback-bug')?.click()` })
      await delay(150)
    }
    const pageState = await client.send('Runtime.evaluate', { expression: `(() => { const stage = document.querySelector('.app-stage'); const shell = document.querySelector('.phone-shell'); const content = document.querySelector('.content-scroll'); const nav = document.querySelector('.bottom-nav'); const selectors = ['.page-title','.primary-button','.welcome-title','.login-hero','.login-hero > taro-image-core','.login-card','.profile-badges','.hero-card','.search-box','.category-chips .chip','.quick-filters > *','.listing-card','.detail-gallery','.detail-gallery .book-cover','.upload-card','.image-grid','.add-image','.tobby-tip','.tobby-tip > taro-image-core','.ai-card','.publish-actions','.notification-grid','.notification-grid > taro-button-core','.notice-copy','.notice-title','.notice-subtitle','.notice-link','.notice-chevron','.notification-feed > taro-button-core','.thread-list > taro-button-core','.thread-list h3 span','.thread-list time','.top-actions .avatar-action','.state-grid taro-button-core','.state-grid taro-image-core','.inline-state taro-image-core','.full-state .state-image','.chat-composer']; const rect = element => { const box = element.getBoundingClientRect(); return { x: Math.round(box.x), y: Math.round(box.y), width: Math.round(box.width), height: Math.round(box.height), right: Math.round(box.right), bottom: Math.round(box.bottom) } }; const measure = element => { const box = element.getBoundingClientRect(); const style = getComputedStyle(element); const child = element.querySelector(':scope > img'); const childBox = child?.getBoundingClientRect(); return { x: Math.round(box.x), y: Math.round(box.y), width: Math.round(box.width), height: Math.round(box.height), minHeight: style.minHeight, boxSizing: style.boxSizing, display: style.display, fontSize: style.fontSize, lineHeight: style.lineHeight, margin: style.margin, padding: style.padding, overflow: style.overflow, objectFit: style.objectFit, transform: style.transform, child: childBox ? { x: Math.round(childBox.x), y: Math.round(childBox.y), width: Math.round(childBox.width), height: Math.round(childBox.height), objectFit: getComputedStyle(child).objectFit, transform: getComputedStyle(child).transform } : null }; }; const metrics = Object.fromEntries(selectors.map(selector => [selector, document.querySelector(selector) ? measure(document.querySelector(selector)) : null])); const stageRect = stage ? rect(stage) : null; const shellRect = shell ? rect(shell) : null; const contentRect = content ? rect(content) : null; const navRect = nav ? rect(nav) : null; const profileMenus = [...document.querySelectorAll('.profile-menu')].map((menu) => { const menuRect = menu.getBoundingClientRect(); const clippedButtons = [...menu.querySelectorAll('button')].filter((button) => { const buttonRect = button.getBoundingClientRect(); return buttonRect.top < menuRect.top - 1 || buttonRect.bottom > menuRect.bottom + 1; }).map((button) => button.innerText.trim()); return { clientHeight: menu.clientHeight, scrollHeight: menu.scrollHeight, buttonCount: menu.querySelectorAll('button').length, clippedButtons }; }); const profileHero = document.querySelector('.profile-hero'); const profileHeroRect = profileHero?.getBoundingClientRect(); const profileHeroClipped = profileHero && profileHeroRect ? [...profileHero.children].filter((child) => { const childRect = child.getBoundingClientRect(); return childRect.top < profileHeroRect.top - 1 || childRect.bottom > profileHeroRect.bottom + 1; }).map((child) => child.className || child.tagName) : []; const documentScroll = { clientWidth: document.documentElement.clientWidth, scrollWidth: document.documentElement.scrollWidth, clientHeight: document.documentElement.clientHeight, scrollHeight: document.documentElement.scrollHeight }; let bottomReachable = null; if (content) { const previousScrollTop = content.scrollTop; const previousScrollBehavior = content.style.scrollBehavior; const maxScrollTop = Math.max(0, content.scrollHeight - content.clientHeight); content.style.scrollBehavior = 'auto'; content.scrollTop = content.scrollHeight; bottomReachable = Math.abs(content.scrollTop - maxScrollTop) <= 1; content.scrollTop = previousScrollTop; content.style.scrollBehavior = previousScrollBehavior; } const layout = { viewport: { width: innerWidth, height: innerHeight, deviceScaleFactor: devicePixelRatio }, stageRect, stageBackground: stage ? getComputedStyle(stage).backgroundImage : '', shellRect, contentRect, navRect, profileMenus, profileHeroClipped, documentScroll, contentScroll: content ? { clientHeight: content.clientHeight, scrollHeight: content.scrollHeight, overflowY: getComputedStyle(content).overflowY, canScroll: content.scrollHeight > content.clientHeight + 1, bottomReachable } : null, stageCoversViewport: stageRect ? stageRect.x <= 0 && stageRect.y <= 0 && stageRect.right >= innerWidth && stageRect.bottom >= innerHeight : null, shellInsideViewport: shellRect ? shellRect.x >= -1 && shellRect.y >= -1 && shellRect.right <= innerWidth + 1 && shellRect.bottom <= innerHeight + 1 : null, navInsideShell: shellRect && navRect ? navRect.x >= shellRect.x - 1 && navRect.y >= shellRect.y - 1 && navRect.right <= shellRect.right + 1 && navRect.bottom <= shellRect.bottom + 1 : null, contentInsideShell: shellRect && contentRect ? contentRect.x >= shellRect.x - 1 && contentRect.y >= shellRect.y - 1 && contentRect.right <= shellRect.right + 1 && contentRect.bottom <= shellRect.bottom + 1 : null }; return { url: location.href, text: document.body.innerText, html: document.body.innerHTML.slice(0, 500), metrics, layout, shell: shell ? { className: shell.className, display: getComputedStyle(shell).display, visibility: getComputedStyle(shell).visibility, text: shell.innerText.slice(0, 160) } : null } })()`, returnByValue: true })
    pages.push({ name, url: pageState.result.value.url, textLength: pageState.result.value.text.length, shellClass: pageState.result.value.shell?.className || null, metrics: pageState.result.value.metrics, layout: pageState.result.value.layout })
    if (!pageState.result.value.shell || pageState.result.value.text.trim().length === 0) diagnostics.push({ type: 'blank-page', text: `${name}: ${pageState.result.value.url}` })
    if (name.startsWith('login-')) {
      const decorativeBadge = await client.send('Runtime.evaluate', { expression: `Boolean(document.querySelector('.login-brand > span:not(.brand)'))`, returnByValue: true })
      if (decorativeBadge.result.value) diagnostics.push({ type: 'login-decoration-remains', text: name })
    }
    if (name === 'feedback-390' && (!pageState.result.value.text.includes('提交 Bug') || !pageState.result.value.text.includes('提交建议') || !pageState.result.value.text.includes('反馈内容'))) diagnostics.push({ type: 'feedback-form-incomplete', text: name })
    if (expectedPageClass[name] && !pageState.result.value.shell?.className.includes(expectedPageClass[name])) diagnostics.push({ type: 'unexpected-page', text: `${name}: expected ${expectedPageClass[name]}, got ${pageState.result.value.shell?.className || 'no shell'}` })
    // The catalogue is local-first: a locally seeded id is served from the seed
    // with no listing request, so the guest detail page renders the seeded
    // record rather than any API fixture. Assert the record really rendered and
    // that no login gate was shown instead.
    if (name === 'detail-guest-390') {
      const guestText = pageState.result.value.text
      const showsRecord = guestText.includes('ISBN 978-7-5608-9493-7') && guestText.includes('高等数学（第七版）上册')
      const showsGate = guestText.includes('登录梨苑儿') || guestText.includes('统一身份认证密码')
      if (!showsRecord || showsGate) diagnostics.push({ type: 'missing-guest-listing-detail', text: name + ':' + showsRecord + ':' + showsGate })
    }
    const layout = pageState.result.value.layout
    if (layout?.documentScroll?.scrollWidth > width + 1) diagnostics.push({ type: 'horizontal-overflow', text: `${name}: document ${layout.documentScroll.scrollWidth}px > viewport ${width}px` })
    if (layout?.stageCoversViewport === false || !layout?.stageBackground || layout.stageBackground === 'none') diagnostics.push({ type: 'background-not-covered', text: `${name}: ${JSON.stringify({ stageRect: layout?.stageRect, viewport: layout?.viewport, background: layout?.stageBackground })}` })
    if (width >= 480 && width < 700 && layout?.shellRect?.width < width - 40) diagnostics.push({ type: 'fixed-compact-canvas', text: `${name}: ${layout.shellRect.width}px shell did not expand with ${width}px viewport` })
    if (layout?.shellInsideViewport === false || layout?.navInsideShell === false || layout?.contentInsideShell === false) diagnostics.push({ type: 'layout-overflow', text: `${name}: ${JSON.stringify(layout)}` })
    if (layout?.contentScroll?.bottomReachable === false) diagnostics.push({ type: 'unreachable-content', text: `${name}: ${JSON.stringify(layout.contentScroll)}` })
    if (layout?.profileMenus?.some((menu) => menu.clippedButtons.length)) diagnostics.push({ type: 'clipped-profile-action', text: `${name}: ${JSON.stringify(layout.profileMenus)}` })
    if (layout?.profileHeroClipped?.length) diagnostics.push({ type: 'clipped-profile-identity', text: `${name}: ${JSON.stringify(layout.profileHeroClipped)}` })
    if (layout?.documentScroll && (layout.documentScroll.scrollWidth > layout.documentScroll.clientWidth + 1 || layout.documentScroll.scrollHeight > layout.documentScroll.clientHeight + 1)) diagnostics.push({ type: 'document-overflow', text: `${name}: ${JSON.stringify(layout.documentScroll)}` })
    if (name.startsWith('home-') && width >= 1024) {
      const responsive = await client.send('Runtime.evaluate', { expression: `(() => { const content = document.querySelector('.home-page .content-scroll'); const hero = document.querySelector('.home-page .hero-card'); const nav = document.querySelector('.bottom-nav'); const box = (element) => { const value = element?.getBoundingClientRect(); return value ? { top: value.top, right: value.right, bottom: value.bottom, left: value.left, width: value.width, height: value.height } : null }; const style = content ? getComputedStyle(content) : null; const items = [...document.querySelectorAll('.bottom-nav .nav-item')].map(box); return { hero: box(hero), content: box(content), paddingLeft: Number.parseFloat(style?.paddingLeft || '0'), paddingRight: Number.parseFloat(style?.paddingRight || '0'), nav: box(nav), items }; })()`, returnByValue: true })
      const value = responsive.result.value
      const expectedLeft = value.content.left + value.paddingLeft
      const expectedRight = value.content.right - value.paddingRight
      if (!value.hero || Math.abs(value.hero.left - expectedLeft) > 2 || Math.abs(value.hero.right - expectedRight) > 2) diagnostics.push({ type: 'hero-not-full-width', text: `${name}: ${JSON.stringify(value)}` })
      if (value.items.length !== 5 || value.items.some((item, index) => !item || item.height < 36 || item.top < value.nav.top - 1 || item.bottom > value.nav.bottom + 1 || index > 0 && item.top < value.items[index - 1].bottom - 1)) diagnostics.push({ type: 'stacked-navigation', text: `${name}: ${JSON.stringify(value)}` })
    }
    if (name === 'messages-390' && !pageState.result.value.text.includes('新消息 · 你好，这本书还在吗？')) diagnostics.push({ type: 'missing-unread-preview', text: name })
    if (name === 'not-found-390' && !pageState.result.value.text.includes('好像翻错书页了')) diagnostics.push({ type: 'missing-not-found-state', text: name })
    if (name === 'messages-390' && [...(pageState.result.value.metrics['.thread-list h3 span'] ? [pageState.result.value.metrics['.thread-list h3 span']] : [])].some((metric) => metric.height > 28)) diagnostics.push({ type: 'wrapped-campus-label', text: `${name}: ${JSON.stringify(pageState.result.value.metrics['.thread-list h3 span'])}` })
    if (name.startsWith('publish-')) {
      const publishLabel = await client.send('Runtime.evaluate', { expression: `(() => { const label = document.querySelector('.bottom-nav .nav-item.publish > span'); if (!label) return null; const style = getComputedStyle(label); return { fontSize: Number.parseFloat(style.fontSize), fontWeight: style.fontWeight }; })()`, returnByValue: true })
      const minimumSize = width >= 1024 ? 17.5 : 11
      if (!publishLabel.result.value || publishLabel.result.value.fontSize < minimumSize) diagnostics.push({ type: 'publish-label-too-small', text: `${name}: ${JSON.stringify(publishLabel.result.value)}` })
    }
    const result = await client.send('Page.captureScreenshot', { format: 'png', fromSurface: true })
    await fs.writeFile(path.join(artifactDir, `${name}.png`), Buffer.from(result.data, 'base64'))
    trace(`target:${name}:done`)
  }
  const dockStateExpression = "(() => { const nav = document.querySelector('.bottom-nav'); const label = document.querySelector('.bottom-nav .nav-item.publish > span'); const items = nav ? [...nav.querySelectorAll('.nav-item')] : []; const rect = (node) => { const box = node.getBoundingClientRect(); return { left: box.left, top: box.top, width: box.width, height: box.height, bottom: box.bottom } }; return { ok: Boolean(nav && label && items.length === 5), nav: nav ? rect(nav) : null, items: items.map(rect), labelSize: label ? Number.parseFloat(getComputedStyle(label).fontSize) : 0, transitionProperty: nav ? getComputedStyle(nav).transitionProperty : '', transitionDuration: nav ? getComputedStyle(nav).transitionDuration : '', itemTransitionProperty: items.length ? getComputedStyle(items[0]).transitionProperty : '', itemTransitionDuration: items.length ? getComputedStyle(items[0]).transitionDuration : '' } })()"
  const evaluateInPage = async (expression) => (await client.send('Runtime.evaluate', { expression, returnByValue: true })).result.value
  const readDockState = async () => evaluateInPage(dockStateExpression)
  // Freeze the responsive morph instead of racing the compositor: pausing every
  // running transition lets the same 380ms animation be sampled at exact,
  // repeatable offsets. rAF sampling cannot promise that a mid-frame survives.
  const freezeDockExpression = "(() => { const animations = [...document.getAnimations()]; for (const animation of animations) { animation.pause(); animation.currentTime = 0 } window.__dockAnimations = animations; const transitions = animations.filter((animation) => animation.transitionProperty); return { total: animations.length, transitions: transitions.length, properties: [...new Set(transitions.map((animation) => animation.transitionProperty))] } })()"
  const seekDockExpression = (time) => "(() => { for (const animation of (window.__dockAnimations || [])) animation.currentTime = " + time + "; return true })()"
  const resumeDockExpression = "(() => { for (const animation of (window.__dockAnimations || [])) animation.play(); window.__dockAnimations = []; return true })()"
  await client.send('Emulation.setDeviceMetricsOverride', { width: 1023, height: 900, deviceScaleFactor: 1, mobile: false })
  trace('dock:navigate')
  const dockLoaded = client.once('Page.loadEventFired')
  await client.send('Page.navigate', { url: `${preview}/profile` })
  await waitForLoad(dockLoaded)
  await delay(750)
  trace('dock:from')
  const from = await readDockState()
  await client.send('Emulation.setDeviceMetricsOverride', { width: 1024, height: 900, deviceScaleFactor: 1, mobile: false })
  const frozen = await evaluateInPage(freezeDockExpression)
  const moments = []
  for (const time of [40, 80, 120, 160, 200, 240, 280, 320]) {
    await evaluateInPage(seekDockExpression(time))
    moments.push({ time, state: await readDockState() })
  }
  await evaluateInPage(resumeDockExpression)
  await delay(500)
  const to = await readDockState()
  trace('dock:to')
  const axes = ['left', 'top', 'width', 'height']
  const spread = (values) => Math.max(...values) - Math.min(...values)
  const sampled = moments.filter((moment) => moment.state?.ok)
  const barIsOneRow = from?.ok && spread(from.items.map((item) => item.top)) <= 12
  const barColumnsEven = from?.ok && from.items.every((item, index) => index === 0 || Math.abs((item.left - from.items[index - 1].left) - from.items[0].width) <= 2)
  const railIsOneColumn = to?.ok && spread(to.items.map((item) => item.left)) <= 2
  const railRowsEven = to?.ok && to.items.every((item, index) => index === 0 || Math.abs((item.top - to.items[index - 1].top) - to.items[0].height) <= 2)
  const railSlotsAreNarrow = to?.ok && to.items.every((item) => item.width <= to.nav.width - 12)
  const frozenGeometry = Boolean(frozen && axes.every((axis) => frozen.properties.includes(axis)))
  const tweenFaults = from?.ok && to?.ok && sampled.length === moments.length ? from.items.flatMap((item, index) => axes.flatMap((axis) => {
    if (Math.abs(to.items[index][axis] - item[axis]) < 24) return []
    const moves = sampled.some((moment) => Math.abs(moment.state.items[index][axis] - item[axis]) > 4 && Math.abs(moment.state.items[index][axis] - to.items[index][axis]) > 4)
    return moves ? [] : [{ item: index, axis, from: +item[axis].toFixed(1), to: +to.items[index][axis].toFixed(1), samples: sampled.map((moment) => +moment.state.items[index][axis].toFixed(1)) }]
  })) : [{ item: -1, axis: 'missing-moment', from: 0, to: 0, samples: [] }]
  // No action may grow past the two settled layouts mid-flight: a bar box sized
  // in percentages would double in size halfway and overlap its neighbours.
  const boxStaysWithinLayout = from?.ok && to?.ok && sampled.every((moment) => moment.state.items.every((entry, index) => entry.width <= Math.max(from.items[index].width, to.items[index].width) + 2 && entry.height <= Math.max(from.items[index].height, to.items[index].height) + 2))
  // Somewhere in the morph the five actions must sit on five distinct slots at
  // once - ordered vertically and no longer sharing one row position.
  const independentTrajectories = sampled.some((moment) => moment.state.items.every((item, index) => index === 0 || item.top - moment.state.items[index - 1].top >= 8) && spread(moment.state.items.map((item) => item.left)) > 8)
  const midpoint = sampled[Math.floor(sampled.length / 2)]?.state
  dockMotion = {
    from: from && { nav: from.nav, items: from.items },
    midpoint: midpoint && { nav: midpoint.nav, items: midpoint.items },
    to: to && { nav: to.nav, items: to.items },
    frozen: frozen && { transitions: frozen.transitions, properties: frozen.properties }
  }
  const dockChecks = {
    frozenTransitions: frozen?.transitions, frozenProperties: frozen?.properties, frozenGeometry,
    barIsOneRow, barColumnsEven, railIsOneColumn, railRowsEven, railSlotsAreNarrow, boxStaysWithinLayout, independentTrajectories,
    sampledMoments: sampled.length, tweenFaults, labelSize: to?.labelSize
  }
  if (!from?.ok || !to?.ok || !frozen || !frozenGeometry || frozen.transitions < 20
    || !barIsOneRow || !barColumnsEven || !railIsOneColumn || !railRowsEven || !railSlotsAreNarrow
    || !boxStaysWithinLayout || !independentTrajectories || sampled.length !== moments.length || tweenFaults.length
    || to.labelSize < 17.5
    || !String(from.transitionDuration).includes('0.38s') || !String(from.itemTransitionDuration).includes('0.38s')
    || !String(from.transitionProperty).includes('width') || !String(from.itemTransitionProperty).includes('left') || !String(from.itemTransitionProperty).includes('top')) {
    diagnostics.push({ type: 'responsive-dock-motion', text: JSON.stringify(dockChecks) })
  }
  trace('back:start')
  await checkBackNavigation(client, preview, artifactDir)
  trace('back:done')
  if (process.env.BITERSTORE_CHECK_ADMIN === '1') await checkAdminReview(client, artifactDir)
  console.log(JSON.stringify({ ok: diagnostics.length === 0, artifactDir, viewports: targets.map(([, width, height, , scale = 1]) => `${width}x${height}@${scale}x`), pages, dockMotion, diagnostics }))
  if (diagnostics.length) process.exitCode = 1
} finally {
  client?.close()
  browser.kill()
  if (previewServer) await new Promise((resolve) => previewServer.close(resolve))
}
