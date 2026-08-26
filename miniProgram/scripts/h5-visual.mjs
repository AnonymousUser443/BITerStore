import fs from 'node:fs/promises'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { root } from './weapp-env.mjs'

const preview = process.env.BITERSTORE_H5_URL || 'http://127.0.0.1:4173'
const chrome = process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
const artifactDir = path.join(root, 'qa-artifacts', 'h5-actual')
const profileDir = path.join(root, 'qa-artifacts', 'chrome-cdp-profile')
const targets = [
  ['home-360', 360, 900, '/home'],
  ['search-390', 390, 900, '/search'],
  ['publish-430', 430, 900, '/publish'],
  ['home-820', 820, 1000, '/home'],
  ['profile-1280', 1280, 900, '/profile']
]

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
async function waitForEndpoint(url) {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    try { const response = await fetch(url); if (response.ok) return response } catch { /* Chrome is starting */ }
    await delay(100)
  }
  throw new Error(`Chrome debugging endpoint unavailable: ${url}`)
}

class CdpClient {
  constructor(url) {
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
const browser = spawn(chrome, ['--headless=new', '--no-first-run', '--disable-gpu', '--hide-scrollbars', '--remote-debugging-port=9333', `--user-data-dir=${profileDir}`, 'about:blank'], { windowsHide: true, stdio: 'ignore' })
let client
try {
  await waitForEndpoint('http://127.0.0.1:9333/json/version')
  const tabResponse = await fetch(`http://127.0.0.1:9333/json/new?${encodeURIComponent(`${preview}/`)}`, { method: 'PUT' })
  const tab = await tabResponse.json()
  client = new CdpClient(tab.webSocketDebuggerUrl)
  await client.send('Page.enable')
  for (const [name, width, height, route] of targets) {
    await client.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: width < 700 })
    const loaded = client.once('Page.loadEventFired')
    await client.send('Page.navigate', { url: `${preview}${route}` })
    await loaded
    await delay(750)
    const result = await client.send('Page.captureScreenshot', { format: 'png', fromSurface: true })
    await fs.writeFile(path.join(artifactDir, `${name}.png`), Buffer.from(result.data, 'base64'))
  }
  console.log(JSON.stringify({ ok: true, artifactDir, viewports: targets.map(([, width, height]) => `${width}x${height}`) }))
} finally {
  client?.close()
  browser.kill()
}
