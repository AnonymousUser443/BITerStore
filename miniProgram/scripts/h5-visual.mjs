import fs from 'node:fs/promises'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { root } from './weapp-env.mjs'

const preview = process.env.BITERSTORE_H5_URL || 'http://127.0.0.1:4173'
const chrome = process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
const artifactDir = process.env.BITERSTORE_H5_ARTIFACT_DIR || path.join(root, 'qa-artifacts', 'h5-actual')
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
  ['notification-390', 390, 900, '/notifications?type=comment'],
  ['notification-768', 768, 1024, '/messages/notifications/comment'],
  ['chat-320', 320, 700, '/chat?id=thread-lin'],
  ['chat-390', 390, 900, '/chat?id=thread-lin'],
  ['chat-768', 768, 1024, '/chat?id=thread-lin'],
  ['chat-1440', 1440, 900, '/chat?id=thread-lin'],
  ['detail-390', 390, 900, '/books?id=math-7'],
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
  ['unavailable-390', 390, 900, '/states?type=unavailable'],
  ['profile-600', 600, 900, '/profile'],
  ['feedback-390', 390, 900, '/feedback'],
  ['home-820', 820, 1000, '/home'],
  ['detail-1024-768', 1024, 768, '/books?id=math-7'],
  ['detail-1280-600', 1280, 600, '/books?id=math-7'],
  ['home-1280-720', 1280, 720, '/home'],
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
  const ownedListing = { ...listing, id: 'qa-owned', title: '我的巡检商品', sellerId: user.id, seller: user };
  const conversation = {
    id: 'thread-lin', listingId: listing.id, sellerId: seller.id, lastMessageAt: '2026-08-29T08:30:00.000Z',
    unread: 1, members: [{ userId: user.id, user }, { userId: seller.id, user: seller }]
  };
  const message = { id: 'qa-message', senderId: seller.id, content: '你好，这本书还在吗？', createdAt: '2026-08-29T08:30:00.000Z' };
  localStorage.setItem('biterstore:v1:authenticated-sid', JSON.stringify(user.id));
  localStorage.setItem('biterstore:v1:snapshot:profile', JSON.stringify({
    id: user.id, studentNumber: user.studentNumber, name: user.nickname, campus: user.campus,
    verified: true, bio: user.bio, responseTime: '通常很快回复', avatarTone: 'sage'
  }));
  localStorage.setItem('biterstore.ui-assets.bundle', '2026.08.24.11');
  const nativeFetch = window.fetch.bind(window);
  window.fetch = async (input, init = {}) => {
    const url = new URL(typeof input === 'string' ? input : input.url, location.origin);
    if (!url.pathname.startsWith('/api/v1/')) return nativeFetch(input, init);
    const path = url.pathname.slice('/api/v1'.length);
    const method = (init.method || (typeof input === 'string' ? 'GET' : input.method) || 'GET').toUpperCase();
    let body;
    if (path === '/me') body = user;
    else if (path === '/listings/favorites/mine') body = [listing];
    else if (path === '/listings/mine/all') body = { items: [ownedListing] };
    else if (path === '/listings' && method === 'GET') body = { items: [listing] };
    else if (path === '/conversations' && method === 'GET') body = [conversation];
    else if (path === '/conversations/thread-lin/messages' && method === 'GET') body = { items: [message] };
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
const browser = spawn(chrome, ['--headless=new', '--no-first-run', '--no-sandbox', '--disable-gpu', '--disable-gpu-sandbox', '--use-angle=swiftshader', '--hide-scrollbars', '--remote-allow-origins=*', '--remote-debugging-port=9333', `--user-data-dir=${profileDir}`, 'about:blank'], { windowsHide: true, stdio: 'ignore' })
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
  await client.send('Page.addScriptToEvaluateOnNewDocument', { source: authenticatedFixture })
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
    if (name === 'feedback-390') {
      await client.send('Runtime.evaluate', { expression: `document.querySelector('#e2e-feedback-bug')?.click()` })
      await delay(150)
    }
    const pageState = await client.send('Runtime.evaluate', { expression: `(() => { const shell = document.querySelector('.phone-shell'); const content = document.querySelector('.content-scroll'); const nav = document.querySelector('.bottom-nav'); const selectors = ['.page-title','.primary-button','.welcome-title','.login-hero','.login-hero > taro-image-core','.login-card','.profile-badges','.hero-card','.search-box','.category-chips .chip','.quick-filters > *','.listing-card','.detail-gallery','.detail-gallery .book-cover','.upload-card','.image-grid','.add-image','.tobby-tip','.tobby-tip > taro-image-core','.ai-card','.publish-actions','.notification-grid','.notification-grid > taro-button-core','.notice-copy','.notice-title','.notice-subtitle','.notice-link','.notice-chevron','.notification-feed > taro-button-core','.thread-list > taro-button-core','.thread-list h3 span','.thread-list time','.top-actions .avatar-action','.state-grid taro-button-core','.state-grid taro-image-core','.inline-state taro-image-core','.full-state .state-image','.chat-composer']; const rect = element => { const box = element.getBoundingClientRect(); return { x: Math.round(box.x), y: Math.round(box.y), width: Math.round(box.width), height: Math.round(box.height), right: Math.round(box.right), bottom: Math.round(box.bottom) } }; const measure = element => { const box = element.getBoundingClientRect(); const style = getComputedStyle(element); const child = element.querySelector(':scope > img'); const childBox = child?.getBoundingClientRect(); return { x: Math.round(box.x), y: Math.round(box.y), width: Math.round(box.width), height: Math.round(box.height), minHeight: style.minHeight, boxSizing: style.boxSizing, display: style.display, fontSize: style.fontSize, lineHeight: style.lineHeight, margin: style.margin, padding: style.padding, overflow: style.overflow, objectFit: style.objectFit, transform: style.transform, child: childBox ? { x: Math.round(childBox.x), y: Math.round(childBox.y), width: Math.round(childBox.width), height: Math.round(childBox.height), objectFit: getComputedStyle(child).objectFit, transform: getComputedStyle(child).transform } : null }; }; const metrics = Object.fromEntries(selectors.map(selector => [selector, document.querySelector(selector) ? measure(document.querySelector(selector)) : null])); const shellRect = shell ? rect(shell) : null; const contentRect = content ? rect(content) : null; const navRect = nav ? rect(nav) : null; const profileMenus = [...document.querySelectorAll('.profile-menu')].map((menu) => { const menuRect = menu.getBoundingClientRect(); const clippedButtons = [...menu.querySelectorAll('button')].filter((button) => { const buttonRect = button.getBoundingClientRect(); return buttonRect.top < menuRect.top - 1 || buttonRect.bottom > menuRect.bottom + 1; }).map((button) => button.innerText.trim()); return { clientHeight: menu.clientHeight, scrollHeight: menu.scrollHeight, buttonCount: menu.querySelectorAll('button').length, clippedButtons }; }); const profileHero = document.querySelector('.profile-hero'); const profileHeroRect = profileHero?.getBoundingClientRect(); const profileHeroClipped = profileHero && profileHeroRect ? [...profileHero.children].filter((child) => { const childRect = child.getBoundingClientRect(); return childRect.top < profileHeroRect.top - 1 || childRect.bottom > profileHeroRect.bottom + 1; }).map((child) => child.className || child.tagName) : []; const documentScroll = { clientWidth: document.documentElement.clientWidth, scrollWidth: document.documentElement.scrollWidth, clientHeight: document.documentElement.clientHeight, scrollHeight: document.documentElement.scrollHeight }; let bottomReachable = null; if (content) { const previousScrollTop = content.scrollTop; const previousScrollBehavior = content.style.scrollBehavior; const maxScrollTop = Math.max(0, content.scrollHeight - content.clientHeight); content.style.scrollBehavior = 'auto'; content.scrollTop = content.scrollHeight; bottomReachable = Math.abs(content.scrollTop - maxScrollTop) <= 1; content.scrollTop = previousScrollTop; content.style.scrollBehavior = previousScrollBehavior; } const layout = { viewport: { width: innerWidth, height: innerHeight }, shellRect, contentRect, navRect, profileMenus, profileHeroClipped, documentScroll, contentScroll: content ? { clientHeight: content.clientHeight, scrollHeight: content.scrollHeight, overflowY: getComputedStyle(content).overflowY, canScroll: content.scrollHeight > content.clientHeight + 1, bottomReachable } : null, shellInsideViewport: shellRect ? shellRect.x >= -1 && shellRect.y >= -1 && shellRect.right <= innerWidth + 1 && shellRect.bottom <= innerHeight + 1 : null, navInsideShell: shellRect && navRect ? navRect.x >= shellRect.x - 1 && navRect.y >= shellRect.y - 1 && navRect.right <= shellRect.right + 1 && navRect.bottom <= shellRect.bottom + 1 : null, contentInsideShell: shellRect && contentRect ? contentRect.x >= shellRect.x - 1 && contentRect.y >= shellRect.y - 1 && contentRect.right <= shellRect.right + 1 && contentRect.bottom <= shellRect.bottom + 1 : null }; return { url: location.href, text: document.body.innerText, html: document.body.innerHTML.slice(0, 500), metrics, layout, shell: shell ? { className: shell.className, display: getComputedStyle(shell).display, visibility: getComputedStyle(shell).visibility, text: shell.innerText.slice(0, 160) } : null } })()`, returnByValue: true })
    pages.push({ name, url: pageState.result.value.url, textLength: pageState.result.value.text.length, shellClass: pageState.result.value.shell?.className || null, metrics: pageState.result.value.metrics, layout: pageState.result.value.layout })
    if (!pageState.result.value.shell || pageState.result.value.text.trim().length === 0) diagnostics.push({ type: 'blank-page', text: `${name}: ${pageState.result.value.url}` })
    if (name.startsWith('login-')) {
      const decorativeBadge = await client.send('Runtime.evaluate', { expression: `Boolean(document.querySelector('.login-brand > span:not(.brand)'))`, returnByValue: true })
      if (decorativeBadge.result.value) diagnostics.push({ type: 'login-decoration-remains', text: name })
    }
    if (name === 'feedback-390' && (!pageState.result.value.text.includes('提交 Bug') || !pageState.result.value.text.includes('提交建议') || !pageState.result.value.text.includes('反馈内容'))) diagnostics.push({ type: 'feedback-form-incomplete', text: name })
    if (expectedPageClass[name] && !pageState.result.value.shell?.className.includes(expectedPageClass[name])) diagnostics.push({ type: 'unexpected-page', text: `${name}: expected ${expectedPageClass[name]}, got ${pageState.result.value.shell?.className || 'no shell'}` })
    const layout = pageState.result.value.layout
    if (layout?.documentScroll?.scrollWidth > width + 1) diagnostics.push({ type: 'horizontal-overflow', text: `${name}: document ${layout.documentScroll.scrollWidth}px > viewport ${width}px` })
    if (width >= 480 && width < 700 && layout?.shellRect?.width < width - 40) diagnostics.push({ type: 'fixed-compact-canvas', text: `${name}: ${layout.shellRect.width}px shell did not expand with ${width}px viewport` })
    if (layout?.shellInsideViewport === false || layout?.navInsideShell === false || layout?.contentInsideShell === false) diagnostics.push({ type: 'layout-overflow', text: `${name}: ${JSON.stringify(layout)}` })
    if (layout?.contentScroll?.bottomReachable === false) diagnostics.push({ type: 'unreachable-content', text: `${name}: ${JSON.stringify(layout.contentScroll)}` })
    if (layout?.profileMenus?.some((menu) => menu.clippedButtons.length)) diagnostics.push({ type: 'clipped-profile-action', text: `${name}: ${JSON.stringify(layout.profileMenus)}` })
    if (layout?.profileHeroClipped?.length) diagnostics.push({ type: 'clipped-profile-identity', text: `${name}: ${JSON.stringify(layout.profileHeroClipped)}` })
    if (layout?.documentScroll && (layout.documentScroll.scrollWidth > layout.documentScroll.clientWidth + 1 || layout.documentScroll.scrollHeight > layout.documentScroll.clientHeight + 1)) diagnostics.push({ type: 'document-overflow', text: `${name}: ${JSON.stringify(layout.documentScroll)}` })
    if (name === 'messages-390' && [...(pageState.result.value.metrics['.thread-list h3 span'] ? [pageState.result.value.metrics['.thread-list h3 span']] : [])].some((metric) => metric.height > 28)) diagnostics.push({ type: 'wrapped-campus-label', text: `${name}: ${JSON.stringify(pageState.result.value.metrics['.thread-list h3 span'])}` })
    const result = await client.send('Page.captureScreenshot', { format: 'png', fromSurface: true })
    await fs.writeFile(path.join(artifactDir, `${name}.png`), Buffer.from(result.data, 'base64'))
  }
  console.log(JSON.stringify({ ok: diagnostics.length === 0, artifactDir, viewports: targets.map(([, width, height]) => `${width}x${height}`), pages, diagnostics }))
  if (diagnostics.length) process.exitCode = 1
} finally {
  client?.close()
  browser.kill()
}
