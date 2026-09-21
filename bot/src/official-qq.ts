import WebSocket from 'ws'

const apiBase = 'https://api.bot.qq.com'
const groupAndC2cIntent = 1 << 25

export type OfficialQQEvent = {
  op?: number
  s?: number | null
  t?: string
  d?: Record<string, unknown>
}

type AccessTokenResponse = { access_token?: string; expires_in?: number; code?: number; message?: string }
type GatewayResponse = { url?: string; code?: number; message?: string }
type EventHandler = (event: OfficialQQEvent) => void | Promise<void>

function errorMessage(body: { code?: number; message?: string }, fallback: string) {
  return body.message ? `${fallback}: ${body.message}` : fallback
}

/** Minimal official QQ Bot gateway/OpenAPI client for group messages. */
export class OfficialQQClient {
  private socket: WebSocket | undefined
  private ready: Promise<void> | undefined
  private heartbeat: NodeJS.Timeout | undefined
  private reconnectTimer: NodeJS.Timeout | undefined
  private sequence: number | null = null
  private stopped = false
  private accessToken: { value: string; expiresAt: number } | undefined

  constructor(
    private readonly appId: string,
    private readonly clientSecret: string,
    private readonly onEvent: EventHandler,
    private readonly reconnectDelayMs = 5_000
  ) {}

  async start() {
    this.stopped = false
    await this.connect()
  }

  stop() {
    this.stopped = true
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer)
    if (this.heartbeat) clearInterval(this.heartbeat)
    this.reconnectTimer = undefined
    this.heartbeat = undefined
    this.socket?.close()
    this.socket = undefined
    this.ready = undefined
  }

  async sendGroupMessage(groupOpenId: string, content: string) {
    const token = await this.getAccessToken()
    const response = await fetch(`${apiBase}/v2/groups/${encodeURIComponent(groupOpenId)}/messages`, {
      method: 'POST',
      headers: { Authorization: `QQBot ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ msg_type: 0, content })
    })
    const body = await response.json().catch(() => ({})) as { code?: number; message?: string }
    if (!response.ok) throw new Error(errorMessage(body, `QQ group message failed (${response.status})`))
  }

  private async getAccessToken(force = false) {
    if (!force && this.accessToken && this.accessToken.expiresAt > Date.now()) return this.accessToken.value
    const response = await fetch(`${apiBase}/app/getAppAccessToken`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ appId: this.appId, clientSecret: this.clientSecret })
    })
    const body = await response.json().catch(() => ({})) as AccessTokenResponse
    if (!response.ok || !body.access_token) throw new Error(errorMessage(body, `QQ access token failed (${response.status})`))
    const expiresIn = Math.max(120, Number(body.expires_in || 7200))
    this.accessToken = { value: body.access_token, expiresAt: Date.now() + (expiresIn - 60) * 1000 }
    return body.access_token
  }

  private async getGateway() {
    const token = await this.getAccessToken()
    const response = await fetch(`${apiBase}/gateway/bot`, { headers: { Authorization: `QQBot ${token}` } })
    const body = await response.json().catch(() => ({})) as GatewayResponse
    if (!response.ok || !body.url) throw new Error(errorMessage(body, `QQ gateway failed (${response.status})`))
    return body.url
  }

  private async connect() {
    if (this.socket?.readyState === WebSocket.OPEN) return
    if (this.ready) return this.ready
    this.ready = this.connectOnce().catch((error) => {
      this.ready = undefined
      this.scheduleReconnect()
      throw error
    })
    return this.ready
  }

  private async connectOnce() {
    const gateway = await this.getGateway()
    await new Promise<void>((resolve, reject) => {
      const socket = new WebSocket(gateway)
      this.socket = socket
      let settled = false
      let helloReceived = false
      const finish = (error?: Error) => {
        if (settled) return
        settled = true
        if (error) reject(error)
        else resolve()
      }
      socket.on('message', (raw) => {
        let payload: OfficialQQEvent
        try { payload = JSON.parse(raw.toString()) as OfficialQQEvent } catch { return }
        if (typeof payload.s === 'number') this.sequence = payload.s
        if (payload.op === 10) {
          helloReceived = true
          const interval = Math.max(5_000, Number((payload.d || {}).heartbeat_interval || 45_000))
          if (this.heartbeat) clearInterval(this.heartbeat)
          this.heartbeat = setInterval(() => {
            if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ op: 1, d: this.sequence }))
          }, interval)
          void this.getAccessToken().then((token) => {
            if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify({
              op: 2,
              d: {
                token: `QQBot ${token}`,
                intents: groupAndC2cIntent,
                shard: [0, 1],
                properties: { $os: 'linux', $browser: 'biterstore', $device: 'biterstore' }
              }
            }))
          }).catch((error) => finish(error instanceof Error ? error : new Error(String(error))))
          return
        }
        if (payload.op === 0 && payload.t === 'READY') {
          finish()
          return
        }
        if (payload.op === 0 && payload.t) void Promise.resolve(this.onEvent(payload)).catch((error) => console.error('[qq-bot] official event error', error))
        if (payload.op === 7 || payload.op === 9) {
          if (payload.op === 7) finish(new Error('QQ gateway requested reconnect'))
          socket.close()
          if (payload.op === 9) finish(new Error('QQ gateway rejected the session'))
        }
      })
      socket.once('error', (error) => finish(error instanceof Error ? error : new Error(String(error))))
      socket.once('close', () => {
        if (this.heartbeat) clearInterval(this.heartbeat)
        this.heartbeat = undefined
        if (this.socket === socket) {
          this.socket = undefined
          this.ready = undefined
        }
        if (!helloReceived && !settled) finish(new Error('QQ gateway closed before READY'))
        this.scheduleReconnect()
      })
    })
  }

  private scheduleReconnect() {
    if (this.stopped || this.reconnectTimer) return
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = undefined
      void this.connect().catch((error) => console.error('[qq-bot] official reconnect failed:', error.message))
    }, this.reconnectDelayMs)
  }
}
