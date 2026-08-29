import fs from 'node:fs'
/* global globalThis */
import net from 'node:net'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import automator from 'miniprogram-automator'
import { assertLocalPaths, automationPort, cliPath, commandArgs, root, windowsCliInvocation, wsEndpoint } from './weapp-env.mjs'

const mode = process.argv.includes('--connect') ? 'connect' : 'launch'
const requestedScenario = process.env.WEAPP_SCENARIO || ''
const connectTimeoutMs = Number(process.env.WEAPP_CONNECT_TIMEOUT_MS || 45000)
const artifactRoot = path.resolve(root, '..', 'qa-artifacts', 'weapp', new Date().toISOString().replace(/[:.]/g, '-'))
fs.mkdirSync(artifactRoot, { recursive: true })
const consoleEvents = []; const observedConsoleEvents = []; const ignoredConsoleEvents = []; const exceptions = []; const observedExceptions = []; let app; let ownsLaunchedSession = false
const namespace = 'biterstore:taro:v1'
const settledRoutes = new Set()
const routeTimings = []
let activeRouteProbe
const write = (name, value) => fs.writeFileSync(path.join(artifactRoot, name), typeof value === 'string' ? value : JSON.stringify(value, null, 2))
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
async function required(page, selector) {
  const element = await page.$(selector)
  if (!element) throw new Error(`缺少稳定元素 ${selector} @ ${page.path}`)
  return element
}
async function shot(name) {
  let lastError
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try { await app.screenshot({ path: path.join(artifactRoot, `${name}.png`) }); return } catch (error) { lastError = error; await sleep(180) }
  }
  throw lastError
}
async function stored(key) { try { const result = await app.callWxMethod('getStorage', { key: `${namespace}:${key}` }); return result?.data } catch { return undefined } }
async function pageAt(pathname, timeout = 15000, expectedQuery = {}) {
  const deadline = Date.now() + timeout
  let lastRoute = ''
  while (Date.now() < deadline) {
    try {
      const page = await app.currentPage()
      lastRoute = page?.path || ''
      const queryMatches = Object.entries(expectedQuery).every(([key, value]) => String(page?.query?.[key] ?? '') === String(value))
      if (lastRoute === pathname && queryMatches) {
        if (activeRouteProbe?.pathname === pathname && activeRouteProbe.routeMs === undefined) activeRouteProbe.routeMs = Date.now() - activeRouteProbe.started
        // The automator reports the new route before DevTools emits onRouteDone.
        // Cold page chunks can need about 10 seconds in the simulator, so do not
        // let the next interaction overlap an unfinished route transition.
        await sleep(settledRoutes.has(pathname) ? 350 : 1200)
        const stablePage = await app.currentPage()
        const stableQueryMatches = Object.entries(expectedQuery).every(([key, value]) => String(stablePage?.query?.[key] ?? '') === String(value))
        if (stablePage?.path === pathname && stableQueryMatches) {
          settledRoutes.add(pathname)
          return stablePage
        }
        lastRoute = stablePage?.path || ''
      }
    } catch { /* DevTools briefly has no page meta during route transitions */ }
    await sleep(150)
  }
  throw new Error(`等待路由 ${pathname} 超时，当前路由 ${lastRoute || 'unknown'}`)
}
async function waitForBootstrap(timeout = 45000) {
  const deadline = Date.now() + timeout
  let lastRoute = ''
  while (Date.now() < deadline) {
    const page = await app.currentPage().catch(() => null)
    lastRoute = page?.path || ''
    if (lastRoute && lastRoute !== 'pages/startup/index') {
      await sleep(1200)
      const stablePage = await app.currentPage().catch(() => null)
      if (stablePage?.path === lastRoute) {
        settledRoutes.add(lastRoute)
        return stablePage
      }
    }
    await sleep(200)
  }
  throw new Error(`等待小程序冷启动完成超时，当前路由 ${lastRoute || 'unknown'}`)
}
async function tapForRoute(element, pathname) {
  const started = Date.now()
  const cold = !settledRoutes.has(pathname)
  activeRouteProbe = { pathname, started, routeMs: undefined }
  const tap = Promise.resolve().then(() => element.tap()).catch((error) => {
    if (!String(error?.message || error).includes('rawPath')) throw error
  })
  const page = await pageAt(pathname)
  await tap
  routeTimings.push({ pathname, cold, routeMs: activeRouteProbe.routeMs, stableMs: Date.now() - started })
  activeRouteProbe = undefined
  return page
}
async function tapForEffect(element) {
  try { await element.tap() } catch (error) {
    const message = String(error?.message || error)
    if (!message.includes('rawPath') && !message.includes('Uncaught [object Object]')) throw error
  }
}
async function recoverBlankPage(page, selector, url) {
  if (await page.$(selector)) return page
  await app.reLaunch(url)
  return pageAt(url.split('?')[0].replace(/^\//, ''), 15000)
}
async function snapshot(page) {
  if (!page) return null
  try { return { route: page.path, query: page.query, data: await page.data() } } catch { return { route: page.path, query: page.query } }
}
function partitionConsoleErrors(events) {
  const errors = events.filter((event) => event?.type === 'error')
  const ignored = new Set()
  for (let index = 0; index < errors.length; index += 1) {
    const event = errors[index]
    const routeDoneNoise = event.args?.some((arg) => typeof arg === 'string' && /routeDone with a webviewId \d+ is not found/.test(arg))
    if (!routeDoneNoise) continue
    ignored.add(event)
    const companion = errors[index + 1]
    const companionDelay = Math.abs(Date.parse(companion?.time || '') - Date.parse(event.time || ''))
    const opaqueObject = companion?.args?.length === 1 && companion.args[0]?.description === '[object Object]' && companion.args[0]?.constructor === 'Object'
    if (companion?.route === event.route && companionDelay <= 100 && opaqueObject) ignored.add(companion)
  }
  return { actionable: errors.filter((event) => !ignored.has(event)), ignored: errors.filter((event) => ignored.has(event)) }
}
async function connectWithRetry(timeout = connectTimeoutMs) {
  const deadline = Date.now() + timeout
  let lastError
  while (Date.now() < deadline) {
    try { return await automator.connect({ wsEndpoint }) } catch (error) { lastError = error }
    await sleep(750)
  }
  throw lastError || new Error(`连接微信自动化端点超时: ${wsEndpoint}`)
}
function runCli(command) {
  const args = commandArgs(command)
  const invocation = process.platform === 'win32' ? windowsCliInvocation(args) : { command: cliPath, args }
  return spawnSync(invocation.command, invocation.args, { encoding: 'utf8', windowsHide: true, windowsVerbatimArguments: process.platform === 'win32', timeout: 60000 })
}
function portIsOpen(port, timeout = 500) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host: '127.0.0.1', port })
    const done = (open) => { socket.destroy(); resolve(open) }
    socket.setTimeout(timeout)
    socket.once('connect', () => done(true))
    socket.once('timeout', () => done(false))
    socket.once('error', () => done(false))
  })
}
async function waitForPortToClose(port, timeout = 15000) {
  const deadline = Date.now() + timeout
  while (Date.now() < deadline) {
    if (!await portIsOpen(port)) return
    await sleep(500)
  }
  throw new Error(`微信自动化端口 ${port} 未在 CLI quit 后释放`)
}
async function scenario(name, run) {
  if (requestedScenario && requestedScenario !== name) return { name, ok: true, skipped: true }
  try {
    await app.callWxMethod('clearStorage')
    await app.callWxMethod('setStorage', { key: `${namespace}:reset-notice`, data: true })
    consoleEvents.length = 0
    exceptions.length = 0
    await run()
    const consoleErrors = partitionConsoleErrors(consoleEvents)
    ignoredConsoleEvents.push(...consoleErrors.ignored.map((event) => ({ ...event, scenario: name, reason: 'DevTools stale WebView routeDone' })))
    if (exceptions.length || consoleErrors.actionable.length) throw new Error(`检测到 ${exceptions.length} 个异常和 ${consoleErrors.actionable.length} 个应用 console error`)
    await shot(`${name}-passed`)
    return { name, ok: true }
  } catch (error) {
    const page = await app.currentPage().catch(() => null)
    await shot(`${name}-failed`).catch(() => undefined)
    write(`${name}-failure.json`, { route: page?.path, error: error.stack || error.message, consoleEvents, exceptions, structure: await snapshot(page) })
    return { name, ok: false, error: error.message }
  }
}
try {
  assertLocalPaths()
  if (mode === 'launch') {
    if (await portIsOpen(automationPort)) {
      const stopped = runCli('quit')
      if (stopped.status !== 0) throw new Error(`微信开发者工具退出失败 (${stopped.status}): ${[stopped.stdout, stopped.stderr, stopped.error?.message].filter(Boolean).join('\n').trim()}`)
      await waitForPortToClose(automationPort)
    }
    const started = runCli('auto')
    if (started.status !== 0) throw new Error(`微信开发者工具启动失败 (${started.status}): ${[started.stdout, started.stderr, started.error?.message].filter(Boolean).join('\n').trim()}`)
    ownsLaunchedSession = true
    await sleep(Number(process.env.WEAPP_LAUNCH_WAIT_MS || 18000))
  }
  if (!app) app = await connectWithRetry()
  const describe = (value) => {
    if (!value || typeof value !== 'object') return value
    const properties = Object.fromEntries(Object.getOwnPropertyNames(value).map((key) => [key, value[key]]))
    if (Object.keys(properties).length) return properties
    const known = Object.fromEntries(['name', 'message', 'errMsg', 'errno', 'code', 'stack'].flatMap((key) => value[key] === undefined ? [] : [[key, value[key]]]))
    return Object.keys(known).length ? known : { description: String(value), constructor: value.constructor?.name }
  }
  app.on('console', (event) => {
    const entry = { ...event, args: event.args?.map(describe), route: 'unknown', time: new Date().toISOString() }
    consoleEvents.push(entry)
    observedConsoleEvents.push(entry)
    void app.currentPage().then((page) => { entry.route = page?.path || 'unknown' }).catch(() => undefined)
  }); app.on('exception', (event) => { const described = describe(event); exceptions.push(described); observedExceptions.push(described) })
  await waitForBootstrap()
  const results = []
  results.push(await scenario('onboarding-guest-home', async () => { await app.reLaunch('/pages/welcome/index'); let page = await pageAt('pages/welcome/index'); await sleep(250); page = await tapForRoute(await required(page, '#e2e-welcome-start'), 'pages/onboarding/index'); await shot('visual-onboarding'); for (let i = 0; i < 3; i += 1) { const next = await required(page, '#e2e-onboarding-next'); if (i < 2) { await next.tap(); await sleep(180) } else page = await tapForRoute(next, 'pages/login/index') } page = await recoverBlankPage(page, '#e2e-guest-access', '/pages/login/index'); await shot('visual-login'); page = await tapForRoute(await required(page, '#e2e-guest-access'), 'pages/home/index'); await required(page, '#e2e-home-search-entry'); await shot('visual-home'); if (!await stored('onboarding')) throw new Error('引导完成状态未持久化'); if (await stored('authenticated-sid') !== 'guest') throw new Error('游客状态未持久化') }))
  results.push(await scenario('search-detail-favorite-contact', async () => { await app.reLaunch('/pages/search/index'); let page = await pageAt('pages/search/index'); await (await required(page, '#e2e-search-input')).input('高等数学'); await sleep(350); await shot('visual-search'); page = await tapForRoute(await required(page, '#e2e-listing-math-7'), 'pages/listing/detail'); await shot('visual-detail'); await (await required(page, '#e2e-detail-favorite')).tap(); await sleep(150); if (!(await stored('favorites'))?.includes('math-7')) throw new Error('收藏未写入 Repository 存储'); await tapForRoute(await required(page, '#e2e-detail-contact'), 'pages/chat/index') }))
  results.push(await scenario('publish-fixture-draft-success', async () => { await app.reLaunch('/pages/publish/index'); let page = await pageAt('pages/publish/index'); await shot('visual-publish-upload'); await (await required(page, '#e2e-publish-media')).tap(); await (await required(page, '#e2e-publish-tobby-ai')).tap(); await sleep(300); await (await required(page, '#e2e-publish-title')).input('自动化测试教材'); await (await required(page, '#e2e-publish-price')).input('16'); await shot('visual-publish-form'); await (await required(page, '#e2e-publish-save')).tap(); await sleep(120); if ((await stored('draft'))?.title !== '自动化测试教材') throw new Error('草稿未持久化'); await (await required(page, '#e2e-publish-submit')).tap(); await sleep(180); await shot('visual-publish-preview'); await (await required(page, '#e2e-publish-submit')).tap(); page = await pageAt('pages/states/index'); await required(page, '#e2e-state-success'); if (!(await stored('listings'))?.some((item) => item.title === '自动化测试教材')) throw new Error('发布结果未写入 Repository 存储') }))
  results.push(await scenario('messages-notification-text-image', async () => { await app.reLaunch('/pages/messages/index'); let page = await pageAt('pages/messages/index'); await shot('visual-messages'); page = await tapForRoute(await required(page, '#e2e-notification-comment'), 'pages/notification/detail'); await required(page, '#e2e-notification-detail-comment'); await shot('visual-notification'); await app.switchTab('/pages/messages/index'); page = await pageAt('pages/messages/index'); page = await tapForRoute(await required(page, '#e2e-thread-thread-lin'), 'pages/chat/index'); await (await required(page, '#e2e-message-input')).input('你好，还在吗？'); await (await required(page, '#e2e-message-send')).tap(); await sleep(120); await (await required(page, '#e2e-message-image')).tap(); await sleep(120); await shot('visual-chat'); const thread = (await stored('threads'))?.find((item) => item.id === 'thread-lin'); if (!thread?.messages.some((item) => item.text === '你好，还在吗？') || !thread.messages.some((item) => item.kind === 'image')) throw new Error('文字或 fixture 图片消息未持久化') }))
  results.push(await scenario('favorites-profile-replay-reset', async () => { await app.reLaunch('/pages/search/index'); let page = await pageAt('pages/search/index'); await sleep(200); page = await tapForRoute(await required(page, '#e2e-listing-math-7'), 'pages/listing/detail'); await (await required(page, '#e2e-detail-favorite')).tap(); await sleep(120); await app.navigateTo('/pages/favorites/index'); page = await pageAt('pages/favorites/index'); await required(page, '#e2e-listing-math-7'); await shot('visual-favorites'); await app.switchTab('/pages/profile/index'); page = await pageAt('pages/profile/index'); page = await recoverBlankPage(page, '#e2e-profile-reset', '/pages/profile/index'); await shot('visual-profile'); await tapForEffect(await required(page, '#e2e-profile-reset')); await sleep(900); if ((await stored('favorites'))?.length) throw new Error('重置后收藏数据仍然存在'); await app.navigateTo('/pages/my-listings/index'); page = await pageAt('pages/my-listings/index'); await required(page, '#e2e-my-listings-empty'); await shot('visual-my-listings-empty'); await app.reLaunch('/pages/onboarding/index'); page = await pageAt('pages/onboarding/index'); await required(page, '#e2e-onboarding-next') }))
  results.push(await scenario('all-states', async () => { for (const state of ['loading', 'searching', 'empty', 'no-results', 'network', 'maintenance', 'unavailable', 'success', 'not-found']) { await app.reLaunch(`/pages/states/index?type=${state}`); const page = await pageAt('pages/states/index', 15000, { type: state }); await required(page, `#e2e-state-${state}`) } }))
  const navigationMetrics = await app.evaluate(() => globalThis.__BITERSTORE_NAV_METRICS__ || []).catch(() => [])
  const observedErrors = partitionConsoleErrors(observedConsoleEvents)
  const consoleSummary = { total: observedConsoleEvents.length, applicationErrors: observedErrors.actionable.length, ignoredDevToolsErrors: ignoredConsoleEvents.length, exceptions: observedExceptions.length }
  const ok = results.every((x) => x.ok) && observedErrors.actionable.length === 0 && observedExceptions.length === 0
  write('result.json', { mode, results, routeTimings, navigationMetrics, consoleSummary, ignoredConsoleEvents, observedExceptions }); console.log(JSON.stringify({ ok, artifactRoot, results, routeTimings, navigationMetrics, consoleSummary }, null, 2)); if (!ok) process.exitCode = 1
} catch (error) { write('launch-failure.json', { error: error.stack || error.message }); console.error(JSON.stringify({ ok: false, artifactRoot, error: error.message }, null, 2)); process.exitCode = 1 } finally { if (app) { try { if (ownsLaunchedSession) await app.close(); else app.disconnect() } catch { /* best-effort local session cleanup */ } } }
