export type BitLoginStatus = 'running' | 'waiting_sms' | 'processing' | 'authenticated' | 'failed' | 'expired' | 'cancelled';

declare const __BIT_LOGIN_URL__: string;

export interface BitLoginChallenge {
  challenge_id: string;
  access_token: string;
  status: BitLoginStatus;
  requested_services: string[];
  ready_services: string[];
  expires_in: number;
  masked_phone?: string;
  error?: string;
}

const baseUrl = __BIT_LOGIN_URL__;
const terminalStatuses: BitLoginStatus[] = ['waiting_sms', 'authenticated', 'failed', 'expired', 'cancelled'];

function getMessage(value: unknown): string {
  if (value && typeof value === 'object' && 'detail' in value) {
    const detail = value.detail;
    if (typeof detail === 'string') return detail;
    if (detail && typeof detail === 'object' && 'message' in detail && typeof detail.message === 'string') return detail.message;
  }
  return '统一身份认证失败，请稍后重试';
}

async function request(path: string, init?: RequestInit): Promise<BitLoginChallenge> {
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  });
  const body = await response.json().catch(() => ({})) as BitLoginChallenge | { detail?: unknown };
  if (!response.ok) throw new Error(getMessage(body));
  return body as BitLoginChallenge;
}

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function pollChallenge(challenge: BitLoginChallenge): Promise<BitLoginChallenge> {
  const deadline = Date.now() + Math.max(challenge.expires_in, 1) * 1000;
  let current = challenge;
  while (!terminalStatuses.includes(current.status) && Date.now() < deadline) {
    await pause(500);
    const snapshot = await request(`/api/auth/${challenge.challenge_id}`, {
      headers: { 'X-Challenge-Token': challenge.access_token },
    });
    current = { ...snapshot, access_token: challenge.access_token };
  }
  if (!terminalStatuses.includes(current.status)) throw new Error('统一身份认证等待超时，请重试');
  if (current.status === 'failed' || current.status === 'expired' || current.status === 'cancelled') throw new Error(current.error || '统一身份认证已失效，请重试');
  return current;
}

export async function startBitLogin(username: string, password: string): Promise<BitLoginChallenge> {
  const challenge = await request('/api/auth/start', {
    method: 'POST',
    // BIT-Login is deployed on the campus network, so use the direct campus
    // CAS callback instead of the unavailable WebVPN endpoint.
    body: JSON.stringify({ username, password, services: ['jwb'], wait_seconds: 1 }),
  });
  if (!challenge.access_token) throw new Error('登录服务未返回 access token');
  return pollChallenge(challenge);
}

export async function submitBitLoginSms(challenge: BitLoginChallenge, code: string): Promise<BitLoginChallenge> {
  const snapshot = await request(`/api/auth/${challenge.challenge_id}/sms`, {
    method: 'POST',
    headers: { 'X-Challenge-Token': challenge.access_token },
    body: JSON.stringify({ code }),
  });
  return pollChallenge({ ...snapshot, access_token: challenge.access_token });
}

export async function getBitLoginRegistrationToken(challenge: BitLoginChallenge): Promise<string> {
  if (challenge.status !== 'authenticated') throw new Error('校园身份尚未认证成功');
  const response = await fetch(`${baseUrl}/api/auth/${challenge.challenge_id}/registration-token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Challenge-Token': challenge.access_token },
    body: JSON.stringify({ audience: 'biterstore' }),
  });
  const body = await response.json().catch(() => ({})) as { registration_token?: string; detail?: unknown };
  if (!response.ok || !body.registration_token) throw new Error(getMessage(body));
  return body.registration_token;
}

export async function destroyBitLoginChallenge(challenge: BitLoginChallenge): Promise<void> {
  await fetch(`${baseUrl}/api/auth/${challenge.challenge_id}`, {
    method: 'DELETE',
    headers: { 'X-Challenge-Token': challenge.access_token },
  }).catch(() => undefined);
}
