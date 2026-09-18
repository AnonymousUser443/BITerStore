import { createHmac, randomBytes } from 'node:crypto'

// Development/test processes get a fresh, process-local fallback so a missing
// local .env never turns into a shared signing key. Production must configure
// both secrets explicitly; bootstrap calls assertSecurityConfiguration() before
// accepting requests.
const ephemeralAccessSecret = randomBytes(32).toString('base64url')
const ephemeralTotpSecret = randomBytes(32).toString('base64url')
const developmentCampusIdentitySecret = 'development-only-campus-identity-hash-key'

function configuredSecret(name: 'ACCESS_TOKEN_SECRET' | 'ADMIN_TOTP_ENCRYPTION_KEY' | 'CAMPUS_IDENTITY_HASH_KEY', fallback: string) {
  const value = process.env[name]?.trim()
  if (!value) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error(`${name} must be configured in production`)
    }
    return fallback
  }
  if (process.env.NODE_ENV === 'production' && (value.length < 32 || /^(.)\1+$/.test(value) || new Set(value).size < 8)) {
    throw new Error(`${name} must contain at least 32 sufficiently diverse characters in production`)
  }
  return value
}

export function accessTokenSecret() {
  return configuredSecret('ACCESS_TOKEN_SECRET', ephemeralAccessSecret)
}

export function adminTotpEncryptionSecret() {
  return configuredSecret('ADMIN_TOTP_ENCRYPTION_KEY', ephemeralTotpSecret)
}

export function campusIdentityHashSecret() {
  return configuredSecret('CAMPUS_IDENTITY_HASH_KEY', developmentCampusIdentitySecret)
}

export function assertSecurityConfiguration() {
  // Calling both functions performs the production presence/entropy checks.
  const access = accessTokenSecret()
  const totp = adminTotpEncryptionSecret()
  const campusIdentity = campusIdentityHashSecret()
  if (process.env.NODE_ENV === 'production' && new Set([access, totp, campusIdentity]).size !== 3) throw new Error('ACCESS_TOKEN_SECRET, ADMIN_TOTP_ENCRYPTION_KEY and CAMPUS_IDENTITY_HASH_KEY must be different in production')
  assertHttpsConfiguration()
}

/**
 * Production browser sessions rely on Secure cookies. Reject an explicitly
 * configured non-HTTPS public origin early instead of silently downgrading the
 * cookie transport. Empty values remain allowed for local/private deployments
 * where the gateway supplies the public origin separately.
 */
export function assertHttpsConfiguration() {
  if (process.env.NODE_ENV !== 'production') return
  const configuredOrigins = [process.env.PUBLIC_API_URL, process.env.WECHAT_WEB_REDIRECT_URI, ...(process.env.H5_ORIGIN || '').split(',')]
    .map((value) => value?.trim())
    .filter((value): value is string => Boolean(value))
  for (const origin of configuredOrigins) {
    if (!/^https:\/\//i.test(origin)) throw new Error(`Production public origin must use HTTPS: ${origin}`)
  }
}

export function isHttpsRequest(request: { protocol?: string; headers?: Record<string, unknown> }) {
  // Fastify derives protocol only through its configured trusted-proxy chain.
  // Reading X-Forwarded-Proto here again would re-introduce header spoofing.
  return request.protocol?.toLowerCase() === 'https'
}

export type TrustedProxyFunction = (address: string, hop: number) => boolean

function trustedProxyHops(hops: number): TrustedProxyFunction {
  return (_address, hop) => hop < hops
}

export function trustedProxySetting(): false | string[] | TrustedProxyFunction {
  const cidrs = (process.env.TRUSTED_PROXY_CIDRS || '').split(',').map((value) => value.trim()).filter(Boolean)
  if (cidrs.length) return cidrs
  const configuredHops = process.env.TRUST_PROXY_HOPS?.trim()
  if (configuredHops) {
    const hops = Number(configuredHops)
    if (!Number.isInteger(hops) || hops < 0 || hops > 10) throw new Error('TRUST_PROXY_HOPS must be an integer between 0 and 10')
    return hops === 0 ? false : trustedProxyHops(hops)
  }
  // The API is reached through the Compose Nginx gateway in production. Trust
  // that one direct hop by default, never an arbitrary client-supplied chain.
  if (process.env.NODE_ENV === 'production' || process.env.TRUST_PROXY === 'true') return trustedProxyHops(1)
  return false
}

export function sanitizedRequestUrl(url?: string) {
  return (url || '/').split('?', 1)[0]
}

export function requestLoggerOptions() {
  return {
    redact: ['req.headers.authorization', 'req.headers.cookie', 'res.headers.set-cookie'],
    serializers: {
      req(request: { method?: string; url?: string; hostname?: string; ip?: string }) {
        const remoteAddressHash = request.ip
          ? createHmac('sha256', accessTokenSecret()).update(request.ip).digest('base64url').slice(0, 20)
          : undefined
        return { method: request.method, url: sanitizedRequestUrl(request.url), hostname: request.hostname, remoteAddressHash }
      }
    }
  }
}

export const API_SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=()'
} as const

export function securityHeadersForRequest(request: { url?: string; protocol?: string; headers?: Record<string, unknown> }) {
  const path = (request.url || '').split('?', 1)[0]
  const contentSecurityPolicy = path.startsWith('/api/v1/docs')
    ? "default-src 'self'; img-src 'self' data: https:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'"
    : path.startsWith('/api/v1/media')
      ? "default-src 'none'; img-src 'self' data:; frame-ancestors 'none'; base-uri 'none'"
      : "default-src 'none'; frame-ancestors 'none'; base-uri 'none'"
  return {
    ...API_SECURITY_HEADERS,
    'Content-Security-Policy': contentSecurityPolicy,
    ...((path.startsWith('/api/v1/auth')
      || path.startsWith('/api/v1/me')
      || path.startsWith('/api/v1/conversations')
      || path.startsWith('/api/v1/notifications')
      || path.startsWith('/api/v1/admin')
      || path.startsWith('/api/v1/uploads')
      || path.startsWith('/api/v1/reports')
      || path.startsWith('/api/v1/moderation')
      || path.startsWith('/api/v1/media/review')
      || path.startsWith('/api/v1/media/owner')
      || path.startsWith('/api/v1/media/conversation')
      || path.startsWith('/api/v1/listings/mine')
      || path.startsWith('/api/v1/listings/favorites')) ? { 'Cache-Control': 'no-store' } : {}),
    ...(process.env.NODE_ENV === 'production' && isHttpsRequest(request) ? { 'Strict-Transport-Security': 'max-age=31536000; includeSubDomains' } : {})
  }
}
