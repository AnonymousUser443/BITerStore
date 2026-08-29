import fs from 'node:fs/promises'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { root } from './weapp-env.mjs'

const preview = process.env.BITERSTORE_H5_URL || 'http://127.0.0.1:4173'
const chrome = process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
const artifactDir = process.env.BITERSTORE_H5_ARTIFACT_DIR || path.join(root, 'qa-artifacts', 'h5-actual')
const profileDir = path.join(root, 'qa-artifacts', `chrome-cdp-profile-${process.pid}`)
const allTargets = [
  ['welcome-390', 390, 900, '/welcome'],
  ['onboarding-390', 390, 900, '/onboarding'],
  ['login-390', 390, 900, '/login'],
  ['login-1280', 1280, 900, '/login'],
  ['home-360', 360, 900, '/home'],
  ['search-390', 390, 900, '/search'],
  ['publish-430', 430, 900, '/publish'],
  ['messages-390', 390, 900, '/messages'],
  ['notification-390', 390, 900, '/notifications?type=comment'],
  ['chat-390', 390, 900, '/chat?id=thread-lin'],
  ['detail-390', 390, 900, '/books?id=math-7'],
  ['home-390-short', 390, 667, '/home'],
  ['home-600-800', 600, 800, '/home'],
  ['detail-844-landscape', 844, 390, '/books?id=math-7'],
  ['favorites-390', 390, 900, '/favorites'],
  ['my-listings-390', 390, 900, '/my-listings'],
  ['states-390', 390, 900, '/states'],
  ['unavailable-390', 390, 900, '/states?type=unavailable'],
  ['home-820', 820, 1000, '/home'],
  ['detail-1024-768', 1024, 768, '/books?id=math-7'],
  ['detail-1280-600', 1280, 600, '/books?id=math-7'],
  ['home-1280-720', 1280, 720, '/home'],
  ['detail-1366-768', 1366, 768, '/books?id=math-7'],
  ['my-listings-1366-768', 1366, 768, '/my-listings'],
  ['profile-1280', 1280, 900, '/profile'],
  ['home-1920-1080', 1920, 1080, '/home']
]
const requestedTargets = new Set((process.env.BITERSTORE_H5_TARGETS || '').split(',').map((value) => value.trim()).filter(Boolean))
const targets = requestedTargets.size ? allTargets.filter(([name]) => requestedTargets.has(name)) : allTargets

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
    const pageState = await client.send('Runtime.evaluate', { expression: `(() => { const shell = document.querySelector('.phone-shell'); const content = document.querySelector('.content-scroll'); const nav = document.querySelector('.bottom-nav'); const selectors = ['.page-title','.primary-button','.welcome-title','.login-hero','.login-hero > taro-image-core','.login-card','.profile-badges','.hero-card','.search-box','.category-chips .chip','.quick-filters > *','.listing-card','.detail-gallery','.detail-gallery .book-cover','.upload-card','.image-grid','.add-image','.tobby-tip','.tobby-tip > taro-image-core','.ai-card','.publish-actions','.notification-grid','.notification-grid > taro-button-core','.notice-copy','.notice-title','.notice-subtitle','.notice-link','.notice-chevron','.notification-feed > taro-button-core','.thread-list > taro-button-core','.state-grid taro-button-core','.state-grid taro-image-core','.inline-state taro-image-core','.full-state .state-image','.chat-composer']; const rect = element => { const box = element.getBoundingClientRect(); return { x: Math.round(box.x), y: Math.round(box.y), width: Math.round(box.width), height: Math.round(box.height), right: Math.round(box.right), bottom: Math.round(box.bottom) } }; const measure = element => { const box = element.getBoundingClientRect(); const style = getComputedStyle(element); const child = element.querySelector(':scope > img'); const childBox = child?.getBoundingClientRect(); return { x: Math.round(box.x), y: Math.round(box.y), width: Math.round(box.width), height: Math.round(box.height), minHeight: style.minHeight, boxSizing: style.boxSizing, display: style.display, fontSize: style.fontSize, lineHeight: style.lineHeight, margin: style.margin, padding: style.padding, overflow: style.overflow, objectFit: style.objectFit, transform: style.transform, child: childBox ? { x: Math.round(childBox.x), y: Math.round(childBox.y), width: Math.round(childBox.width), height: Math.round(childBox.height), objectFit: getComputedStyle(child).objectFit, transform: getComputedStyle(child).transform } : null }; }; const metrics = Object.fromEntries(selectors.map(selector => [selector, document.querySelector(selector) ? measure(document.querySelector(selector)) : null])); const shellRect = shell ? rect(shell) : null; const contentRect = content ? rect(content) : null; const navRect = nav ? rect(nav) : null; let bottomReachable = null; if (content) { const previousScrollTop = content.scrollTop; const previousScrollBehavior = content.style.scrollBehavior; const maxScrollTop = Math.max(0, content.scrollHeight - content.clientHeight); content.style.scrollBehavior = 'auto'; content.scrollTop = content.scrollHeight; bottomReachable = Math.abs(content.scrollTop - maxScrollTop) <= 1; content.scrollTop = previousScrollTop; content.style.scrollBehavior = previousScrollBehavior; } const layout = { viewport: { width: innerWidth, height: innerHeight }, shellRect, contentRect, navRect, contentScroll: content ? { clientHeight: content.clientHeight, scrollHeight: content.scrollHeight, overflowY: getComputedStyle(content).overflowY, canScroll: content.scrollHeight > content.clientHeight + 1, bottomReachable } : null, shellInsideViewport: shellRect ? shellRect.x >= -1 && shellRect.y >= -1 && shellRect.right <= innerWidth + 1 && shellRect.bottom <= innerHeight + 1 : null, navInsideShell: shellRect && navRect ? navRect.x >= shellRect.x - 1 && navRect.y >= shellRect.y - 1 && navRect.right <= shellRect.right + 1 && navRect.bottom <= shellRect.bottom + 1 : null, contentInsideShell: shellRect && contentRect ? contentRect.x >= shellRect.x - 1 && contentRect.y >= shellRect.y - 1 && contentRect.right <= shellRect.right + 1 && contentRect.bottom <= shellRect.bottom + 1 : null }; return { url: location.href, text: document.body.innerText, html: document.body.innerHTML.slice(0, 500), metrics, layout, shell: shell ? { className: shell.className, display: getComputedStyle(shell).display, visibility: getComputedStyle(shell).visibility, text: shell.innerText.slice(0, 160) } : null } })()`, returnByValue: true })
    pages.push({ name, url: pageState.result.value.url, textLength: pageState.result.value.text.length, shellClass: pageState.result.value.shell?.className || null, metrics: pageState.result.value.metrics, layout: pageState.result.value.layout })
    if (!pageState.result.value.shell || pageState.result.value.text.trim().length === 0) diagnostics.push({ type: 'blank-page', text: `${name}: ${pageState.result.value.url}` })
    const layout = pageState.result.value.layout
    if (layout?.shellInsideViewport === false || layout?.navInsideShell === false || layout?.contentInsideShell === false) diagnostics.push({ type: 'layout-overflow', text: `${name}: ${JSON.stringify(layout)}` })
    if (layout?.contentScroll?.bottomReachable === false) diagnostics.push({ type: 'unreachable-content', text: `${name}: ${JSON.stringify(layout.contentScroll)}` })
    const result = await client.send('Page.captureScreenshot', { format: 'png', fromSurface: true })
    await fs.writeFile(path.join(artifactDir, `${name}.png`), Buffer.from(result.data, 'base64'))
  }
  console.log(JSON.stringify({ ok: diagnostics.length === 0, artifactDir, viewports: targets.map(([, width, height]) => `${width}x${height}`), pages, diagnostics }))
  if (diagnostics.length) process.exitCode = 1
} finally {
  client?.close()
  browser.kill()
}
