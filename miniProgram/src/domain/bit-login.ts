import { bitLoginTransport } from '@/platform'

export type BitLoginStatus = 'running' | 'waiting_sms' | 'processing' | 'authenticated' | 'failed' | 'expired'
export interface BitLoginChallenge {
  challenge_id: string; access_token: string; status: BitLoginStatus; requested_services: string[]; ready_services: string[];
  expires_in: number; masked_phone?: string; error?: string
}

const terminal: BitLoginStatus[] = ['waiting_sms', 'authenticated', 'failed', 'expired']
const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

async function poll(challenge: BitLoginChallenge) {
  const deadline = Date.now() + Math.max(challenge.expires_in, 1) * 1000
  let current = challenge
  while (!terminal.includes(current.status) && Date.now() < deadline) {
    await pause(500)
    current = { ...(await bitLoginTransport.status(challenge.challenge_id, challenge.access_token)), access_token: challenge.access_token }
  }
  if (!terminal.includes(current.status)) throw new Error('统一身份认证等待超时，请重试')
  if (current.status === 'failed' || current.status === 'expired') throw new Error(current.error || '统一身份认证已失效，请重试')
  return current
}

export async function startBitLogin(username: string, password: string) {
  const challenge = await bitLoginTransport.start(username, password)
  if (!challenge.access_token) throw new Error('登录服务未返回 access token')
  return poll(challenge)
}

export async function submitBitLoginSms(challenge: BitLoginChallenge, code: string) {
  const snapshot = await bitLoginTransport.sms(challenge.challenge_id, challenge.access_token, code)
  return poll({ ...snapshot, access_token: challenge.access_token })
}
