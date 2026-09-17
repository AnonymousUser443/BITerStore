import { Body, Controller, Get, Headers, Post, Query, Req, Res, UseGuards } from '@nestjs/common'
import type { FastifyReply, FastifyRequest } from 'fastify'
import { AuthGuard, CurrentUser, type AuthUser } from '../../common/auth.js'
import { AuthService } from './auth.service.js'
import { optionalBodyString, requiredBodyString, strictBody } from '../../common/request-validation.js'

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}
  @Post('campus')
  async campus(
    @Body() body: unknown,
    @Headers('user-agent') userAgent: string | undefined,
    @Res({ passthrough: true }) reply: FastifyReply
  ) {
    const input = strictBody(body, ['registrationToken', 'platform', 'device', 'sessionTransport'])
    const registrationToken = requiredBodyString(input, 'registrationToken', '校园认证凭证', 16_384)
    const platform = optionalBodyString(input, 'platform', '平台', 20)
    const device = optionalBodyString(input, 'device', '设备类型', 20)
    const result = await this.auth.campus(registrationToken, platform, inferSessionDevice(platform, device, userAgent))
    return this.presentSession(reply, result, platform?.toLowerCase() === 'h5' ? 'cookie' : 'body')
  }
  @Post('wechat/mini-program') mini(
    @Body() body: unknown,
    @Headers('user-agent') userAgent?: string
  ) { const input = strictBody(body, ['code', 'device']); return this.auth.miniProgram(requiredBodyString(input, 'code', '微信登录凭证', 2048), inferSessionDevice('weapp', optionalBodyString(input, 'device', '设备类型', 20), userAgent)) }
  @Post('wechat/mini-program/bind') @UseGuards(AuthGuard) bindMini(@CurrentUser() user: AuthUser, @Body() body: unknown) { const input = strictBody(body, ['code']); return this.auth.bindMiniProgram(user.id, requiredBodyString(input, 'code', '微信登录凭证', 2048)) }
  @Post('wechat/web/start') startWeb() { return this.auth.startWebLogin() }
  @Get('wechat/web/status')
  async status(
    @Query('state') state: string,
    @Res({ passthrough: true }) reply: FastifyReply
  ) {
    const result = await this.auth.webStatus(state)
    if (result.status === 'AUTHENTICATED') {
      const session = this.presentSession(reply, result as { accessToken: string; refreshToken: string; expiresIn: number; user: { id: string; role: string; campusStatus: string } }, 'cookie')
      // Keep the state-machine result so H5/Taro polling can stop after the
      // cookie has been issued. `presentSession` intentionally omits tokens,
      // but the status marker is safe and required by the polling client.
      return { status: 'AUTHENTICATED', ...session }
    }
    return result
  }
  @Get('wechat/web/callback') async callback(
    @Query('code') code: string,
    @Query('state') state: string,
    @Headers('user-agent') userAgent: string | undefined,
    @Res() reply: FastifyReply
  ) { await this.auth.webCallback(code, state, inferSessionDevice('h5', undefined, userAgent)); const h5 = (process.env.H5_ORIGIN || '').split(',')[0] || 'http://localhost:10086'; return reply.redirect(`${h5.replace(/\/$/, '')}/login?wechat=complete`) }
  @Post('refresh')
  async refresh(
    @Body() body: unknown,
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply
  ) {
    const input = body === undefined || body === null ? {} : strictBody(body, ['refreshToken', 'sessionTransport'])
    const cookieToken = request.cookies?.biterstore_refresh
    const refreshToken = cookieToken || optionalBodyString(input, 'refreshToken', '刷新凭证', 4096)
    const result = await this.auth.refresh(refreshToken || '')
    return this.presentSession(reply, result, cookieToken ? 'cookie' : 'body')
  }

  @Post('logout')
  async logout(
    @Body() body: unknown,
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply
  ) {
    const input = body === undefined || body === null ? {} : strictBody(body, ['refreshToken'])
    const refreshToken = request.cookies?.biterstore_refresh || optionalBodyString(input, 'refreshToken', '刷新凭证', 4096)
    const accessToken = String(request?.headers?.authorization || '').replace(/^Bearer\s+/i, '') || undefined
    const result = accessToken
      ? await this.auth.logout(refreshToken, accessToken)
      : await this.auth.logout(refreshToken)
    this.clearSessionCookies(reply)
    return result
  }

  private presentSession(
    reply: FastifyReply,
    result: { accessToken: string; refreshToken: string; expiresIn: number; user: { id: string; role: string; campusStatus: string } },
    transport: 'body' | 'cookie' = 'body'
  ) {
    if (transport !== 'cookie') return result
    const secure = process.env.NODE_ENV === 'production'
    // Remove cookies issued by earlier transports before writing the current
    // first-party session. Lax blocks cookies on cross-site subrequests while
    // working in embedded browsers and after entry through external links.
    reply.clearCookie('biterstore_access', { httpOnly: true, secure, sameSite: 'lax', path: '/' })
    reply.clearCookie('biterstore_access', { httpOnly: true, secure, sameSite: 'lax', path: '/api/v1' })
    reply.clearCookie('biterstore_refresh', { httpOnly: true, secure, sameSite: 'strict', path: '/api/v1/auth' })
    reply.setCookie('biterstore_access', result.accessToken, {
      httpOnly: true, secure, sameSite: 'lax', path: '/api/v1', maxAge: result.expiresIn
    })
    reply.setCookie('biterstore_refresh', result.refreshToken, {
      httpOnly: true, secure, sameSite: 'lax', path: '/api/v1',
      maxAge: Number(process.env.REFRESH_TOKEN_TTL_DAYS || 30) * 86400
    })
    return { expiresIn: result.expiresIn, user: result.user }
  }

  private clearSessionCookies(reply: FastifyReply) {
    const secure = process.env.NODE_ENV === 'production'
    reply.clearCookie('biterstore_access', { httpOnly: true, secure, sameSite: 'lax', path: '/' })
    reply.clearCookie('biterstore_access', { httpOnly: true, secure, sameSite: 'lax', path: '/api/v1' })
    reply.clearCookie('biterstore_refresh', { httpOnly: true, secure, sameSite: 'strict', path: '/api/v1/auth' })
    reply.clearCookie('biterstore_refresh', { httpOnly: true, secure, sameSite: 'lax', path: '/api/v1' })
  }
}

export function inferSessionDevice(platform = 'campus', provided?: string, userAgent?: string) {
  const normalized = provided?.trim().toLowerCase()
  if (normalized && ['phone', 'tablet', 'desktop'].includes(normalized)) return normalized
  if (platform.toLowerCase() === 'weapp') return 'phone'
  const agent = userAgent?.toLowerCase() || ''
  if (/ipad|tablet|kindle|silk/.test(agent) || (agent.includes('android') && !agent.includes('mobile'))) return 'tablet'
  if (/mobile|iphone|ipod|android|windows phone/.test(agent)) return 'phone'
  return 'desktop'
}
