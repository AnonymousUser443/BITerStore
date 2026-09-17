import {
  BadGatewayException,
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  UnauthorizedException
} from '@nestjs/common'
import { createHash, randomBytes } from 'node:crypto'
import { effectiveCampusStatus, signAccessToken, verifyAccessToken, type AuthUser } from '../../common/auth.js'
import { PrismaService } from '../../infra/prisma.service.js'
import { RedisService } from '../../infra/redis.service.js'
import { IdentityService } from '../identity/identity.service.js'

export const hashRefreshToken = (value: string) => createHash('sha256').update(value).digest('hex')

type SessionUser = AuthUser & {
  status?: string
  campusIdentities?: Array<{ expiresAt: Date | null; revokedAt: Date | null }>
}

const authUserInclude = {
  user: {
    include: {
      campusIdentities: { orderBy: { verifiedAt: 'desc' as const }, take: 1, select: { expiresAt: true, revokedAt: true } }
    }
  }
} as const

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly identity: IdentityService
  ) {}

  private async resolveWechatCode(code: string) {
    if (process.env.NODE_ENV !== 'production' && process.env.ALLOW_DEV_AUTH === 'true' && code.startsWith('dev-')) {
      return { openid: code, unionid: code }
    }
    const appid = process.env.WECHAT_MINI_APP_ID
    const secret = process.env.WECHAT_MINI_APP_SECRET
    if (!appid || !secret) throw new BadGatewayException('微信小程序登录尚未配置')
    const url = new URL('https://api.weixin.qq.com/sns/jscode2session')
    url.search = new URLSearchParams({ appid, secret, js_code: code, grant_type: 'authorization_code' }).toString()
    const response = await fetch(url)
    const body = await response.json() as { openid?: string; unionid?: string; errcode?: number; errmsg?: string }
    if (!response.ok || !body.openid || body.errcode) throw new UnauthorizedException('微信登录凭证无效')
    return body as { openid: string; unionid?: string }
  }

  async campus(registrationToken: string, platform = 'campus', device?: string) {
    if (!registrationToken) throw new BadRequestException('缺少校园认证凭证')
    const user = await this.identity.loginOrCreate(registrationToken)
    return this.issue(user, platform, device)
  }

  async miniProgram(code: string, device?: string) {
    if (!code) throw new BadRequestException('缺少微信登录 code')
    const identity = await this.resolveWechatCode(code)
    const appId = process.env.WECHAT_MINI_APP_ID || 'dev-mini-program'
    let account = await this.prisma.wechatAccount.findUnique({
      where: { appId_openid: { appId, openid: identity.openid } },
      include: authUserInclude
    })
    if (!account && identity.unionid) {
      account = await this.prisma.wechatAccount.findFirst({ where: { unionid: identity.unionid }, include: authUserInclude })
    }
    if (!account) throw new ConflictException('该微信尚未绑定，请先使用学号登录后在“我的”中绑定微信')
    if (account.user.campusStatus !== 'VERIFIED') throw new ConflictException('该微信尚未绑定已认证学号，请先使用学号登录后重新绑定')
    if (effectiveCampusStatus(account.user) !== 'VERIFIED') throw new ConflictException('campus identity is not verified')
    await this.prisma.wechatAccount.update({
      where: { id: account.id },
      data: { lastLoginAt: new Date(), unionid: identity.unionid || account.unionid }
    })
    return this.issue(account.user, 'weapp', device)
  }

  async bindMiniProgram(userId: string, code: string) {
    if (!code) throw new BadRequestException('缺少微信登录 code')
    const identity = await this.resolveWechatCode(code)
    const appId = process.env.WECHAT_MINI_APP_ID || 'dev-mini-program'
    const includeOwner = { user: { select: { campusStatus: true, campusIdentities: { select: { id: true }, take: 1 } } } } as const
    const byOpenId = await this.prisma.wechatAccount.findUnique({ where: { appId_openid: { appId, openid: identity.openid } }, include: includeOwner })
    const byUnionId = !byOpenId && identity.unionid
      ? await this.prisma.wechatAccount.findFirst({ where: { unionid: identity.unionid }, include: includeOwner })
      : null
    const existing = byOpenId || byUnionId
    if (existing && existing.userId !== userId) {
      const isLegacyWechatOnly = existing.user.campusStatus === 'UNVERIFIED' && existing.user.campusIdentities.length === 0
      if (!isLegacyWechatOnly) throw new ConflictException('该微信已绑定其他账号')
      await this.prisma.$transaction([
        this.prisma.wechatAccount.update({ where: { id: existing.id }, data: { userId, lastLoginAt: new Date(), unionid: identity.unionid || existing.unionid } }),
        this.prisma.session.updateMany({ where: { userId: existing.userId }, data: { revokedAt: new Date() } }),
        this.prisma.user.update({ where: { id: existing.userId }, data: { status: 'DELETED', deletedAt: new Date() } })
      ])
    } else if (existing) {
      await this.prisma.wechatAccount.update({
        where: { id: existing.id },
        data: { lastLoginAt: new Date(), unionid: identity.unionid || existing.unionid }
      })
    } else {
      await this.prisma.wechatAccount.create({
        data: { userId, appType: 'MINI_PROGRAM', appId, openid: identity.openid, unionid: identity.unionid, lastLoginAt: new Date() }
      })
    }
    return { bound: true }
  }

  async startWebLogin() {
    await this.redis.ensureConnected()
    const state = randomBytes(24).toString('base64url')
    // Keep the pending marker as a scalar so the callback claim can compare it
    // atomically without parsing JSON inside Redis Lua.
    await this.redis.client.setex(`web-login:${state}`, 300, 'PENDING')
    const appid = process.env.WECHAT_WEB_APP_ID || ''
    const redirect = process.env.WECHAT_WEB_REDIRECT_URI || ''
    const authorizeUrl = appid && redirect
      ? `https://open.weixin.qq.com/connect/qrconnect?appid=${encodeURIComponent(appid)}&redirect_uri=${encodeURIComponent(redirect)}&response_type=code&scope=snsapi_login&state=${state}#wechat_redirect`
      : ''
    return { state, expiresIn: 300, authorizeUrl }
  }

  async webStatus(state: string) {
    await this.redis.ensureConnected()
    if (!/^[A-Za-z0-9_-]{20,80}$/.test(state)) throw new BadRequestException('登录请求不存在或已过期')
    const key = `web-login:${state}`
    const raw = await this.redis.client.get(key)
    if (!raw) throw new BadRequestException('登录请求不存在或已过期')
    let parsed: { status?: string }
    try {
      parsed = raw === 'PENDING' ? { status: 'PENDING' } : JSON.parse(raw) as { status?: string }
    } catch {
      throw new BadRequestException('登录请求不存在或已过期')
    }
    if (parsed.status !== 'AUTHENTICATED') return parsed
    // A completed browser login is a one-time exchange. Redis GETDEL is
    // atomic, so two polling tabs cannot both receive the same session.
    const consumed = typeof this.redis.client.getdel === 'function'
      ? await this.redis.client.getdel(key)
      : await this.redis.client.eval("local value = redis.call('GET', KEYS[1]); if value and string.find(value, '\"status\"%s*:%s*\"AUTHENTICATED\"') then redis.call('DEL', KEYS[1]); return value end; return nil", 1, key) as string | null
    if (!consumed) throw new BadRequestException('登录请求不存在或已使用')
    return JSON.parse(consumed)
  }

  async webCallback(code: string, state: string, device?: string) {
    await this.redis.ensureConnected()
    const key = `web-login:${state}`
    if (!/^[A-Za-z0-9_-]{20,80}$/.test(state)) throw new BadRequestException('state 无效或已使用')
    const claimed = await this.redis.client.eval(
      "local value = redis.call('GET', KEYS[1]); if value == 'PENDING' or value == '{\"status\":\"PENDING\"}' then redis.call('SET', KEYS[1], ARGV[1], 'EX', ARGV[2]); return 1 else return 0 end",
      1, key, JSON.stringify({ status: 'PROCESSING' }), 300
    )
    if (Number(claimed) !== 1) throw new BadRequestException('state 无效或已使用')
    try {
      const appid = process.env.WECHAT_WEB_APP_ID || ''
      const secret = process.env.WECHAT_WEB_APP_SECRET || ''
      let identity: { openid: string; unionid?: string }
      if (process.env.NODE_ENV !== 'production' && process.env.ALLOW_DEV_AUTH === 'true' && code.startsWith('dev-')) {
        identity = { openid: code, unionid: code }
      } else {
        if (!appid || !secret) throw new BadGatewayException('微信网站登录尚未配置')
        const url = new URL('https://api.weixin.qq.com/sns/oauth2/access_token')
        url.search = new URLSearchParams({ appid, secret, code, grant_type: 'authorization_code' }).toString()
        const body = await fetch(url).then((response) => response.json()) as typeof identity & { errcode?: number }
        if (!body.openid || body.errcode) throw new UnauthorizedException('微信网页授权失败')
        identity = body
      }
      const webAppId = appid || 'dev-web'
      let account = await this.prisma.wechatAccount.findUnique({
        where: { appId_openid: { appId: webAppId, openid: identity.openid } },
        include: authUserInclude
      })
      if (!account && identity.unionid) {
        account = await this.prisma.wechatAccount.findFirst({ where: { unionid: identity.unionid }, include: authUserInclude })
      }
      if (!account) throw new ConflictException('该微信尚未绑定，请先使用学号登录并绑定微信')
      if (account.user.campusStatus !== 'VERIFIED') throw new ConflictException('该微信尚未绑定已认证学号，请先使用学号登录后重新绑定')
      if (effectiveCampusStatus(account.user) !== 'VERIFIED') throw new ConflictException('campus identity is not verified')
      const tokens = await this.issue(account.user, 'h5', device)
      await this.redis.client.setex(key, 60, JSON.stringify({ status: 'AUTHENTICATED', ...tokens }))
      return { status: 'authenticated' }
    } catch (error) {
      await this.redis.client.setex(key, 300, 'PENDING').catch(() => undefined)
      throw error
    }
  }

  private async issue(user: SessionUser, platform: string, device?: string) {
    const issuedUser = user.campusIdentities ? { ...user, campusStatus: effectiveCampusStatus(user) } : user
    if (user.status && !['ACTIVE', 'MUTED'].includes(user.status)) throw new ForbiddenException('账号当前不可用')
    const refreshToken = randomBytes(48).toString('base64url')
    const expiresAt = new Date(Date.now() + Number(process.env.REFRESH_TOKEN_TTL_DAYS || 30) * 86400000)
    const session = await this.prisma.session.create({
      data: {
        userId: user.id,
        refreshTokenHash: hashRefreshToken(refreshToken),
        platform: platform.trim().slice(0, 30) || 'unknown',
        device: device?.trim().slice(0, 60) || null,
        expiresAt
      }
    })
    return {
      accessToken: await signAccessToken(issuedUser, false, session?.id),
      refreshToken,
      expiresIn: Number(process.env.ACCESS_TOKEN_TTL_SECONDS || 900),
      user: { id: user.id, role: user.role, campusStatus: issuedUser.campusStatus }
    }
  }

  async refresh(refreshToken: string) {
    const session = await this.prisma.session.findUnique({ where: { refreshTokenHash: hashRefreshToken(refreshToken) }, include: authUserInclude })
    if (!session || session.revokedAt || session.expiresAt <= new Date() || !['ACTIVE', 'MUTED'].includes(session.user.status) || session.user.campusStatus !== 'VERIFIED') {
      throw new UnauthorizedException('刷新凭证无效')
    }
    if (effectiveCampusStatus(session.user) !== 'VERIFIED') throw new UnauthorizedException('campus identity is not verified')
    const revoked = await this.prisma.session.updateMany({ where: { id: session.id, revokedAt: null }, data: { revokedAt: new Date() } })
    if (revoked.count !== 1) throw new UnauthorizedException('刷新凭证已被使用')
    return this.issue(session.user, session.platform, session.device || undefined)
  }

  async logout(refreshToken?: string, accessToken?: string) {
    const now = new Date()
    if (refreshToken) {
      await this.prisma.session.updateMany({ where: { refreshTokenHash: hashRefreshToken(refreshToken) }, data: { revokedAt: now } })
    }
    if (accessToken) {
      try {
        const { payload } = await verifyAccessToken(accessToken)
        if (typeof payload.sid === 'string' && typeof payload.sub === 'string') {
          await this.prisma.session.updateMany({ where: { id: payload.sid, userId: payload.sub, revokedAt: null }, data: { revokedAt: now } })
        }
      } catch {
        // Logout remains idempotent when the access token is already expired
        // or belongs to an older signing key.
      }
    }
    return { ok: true }
  }
}
