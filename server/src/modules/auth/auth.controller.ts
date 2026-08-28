import { Body, Controller, Get, Post, Query, Req, Res, UseGuards } from '@nestjs/common'
import type { FastifyReply, FastifyRequest } from 'fastify'
import { AuthGuard, CurrentUser, type AuthUser } from '../../common/auth.js'
import { AuthService } from './auth.service.js'

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}
  @Post('campus')
  async campus(
    @Body() body: { registrationToken: string; platform?: string; device?: string; sessionTransport?: 'body' | 'cookie' },
    @Res({ passthrough: true }) reply: FastifyReply
  ) {
    const result = await this.auth.campus(body.registrationToken, body.platform, body.device)
    return this.presentSession(reply, result, body.sessionTransport)
  }
  @Post('wechat/mini-program') mini(@Body() body: { code: string; device?: string }) { return this.auth.miniProgram(body.code, body.device) }
  @Post('wechat/mini-program/bind') @UseGuards(AuthGuard) bindMini(@CurrentUser() user: AuthUser, @Body() body: { code: string }) { return this.auth.bindMiniProgram(user.id, body.code) }
  @Post('wechat/web/start') startWeb() { return this.auth.startWebLogin() }
  @Get('wechat/web/status') status(@Query('state') state: string) { return this.auth.webStatus(state) }
  @Get('wechat/web/callback') async callback(@Query('code') code: string, @Query('state') state: string, @Res() reply: FastifyReply) { await this.auth.webCallback(code, state); const h5 = (process.env.H5_ORIGIN || '').split(',')[0] || 'http://localhost:10086'; return reply.redirect(`${h5.replace(/\/$/, '')}/login?wechat=complete`) }
  @Post('refresh')
  async refresh(
    @Body() body: { refreshToken?: string; sessionTransport?: 'body' | 'cookie' },
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply
  ) {
    const cookieToken = request.cookies?.biterstore_refresh
    const refreshToken = body.refreshToken || cookieToken
    const result = await this.auth.refresh(refreshToken || '')
    return this.presentSession(reply, result, body.sessionTransport || (cookieToken ? 'cookie' : 'body'))
  }

  @Post('logout')
  async logout(
    @Body() body: { refreshToken?: string },
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply
  ) {
    const result = await this.auth.logout(body.refreshToken || request.cookies?.biterstore_refresh)
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
    // Remove the access cookie issued at `/` by the pre-cookie-transport API.
    reply.clearCookie('biterstore_access', { httpOnly: true, secure, sameSite: 'lax', path: '/' })
    reply.setCookie('biterstore_access', result.accessToken, {
      httpOnly: true, secure, sameSite: 'strict', path: '/api/v1', maxAge: result.expiresIn
    })
    reply.setCookie('biterstore_refresh', result.refreshToken, {
      httpOnly: true, secure, sameSite: 'strict', path: '/api/v1/auth',
      maxAge: Number(process.env.REFRESH_TOKEN_TTL_DAYS || 30) * 86400
    })
    return { expiresIn: result.expiresIn, user: result.user }
  }

  private clearSessionCookies(reply: FastifyReply) {
    const secure = process.env.NODE_ENV === 'production'
    reply.clearCookie('biterstore_access', { httpOnly: true, secure, sameSite: 'lax', path: '/' })
    reply.clearCookie('biterstore_access', { httpOnly: true, secure, sameSite: 'strict', path: '/api/v1' })
    reply.clearCookie('biterstore_refresh', { httpOnly: true, secure, sameSite: 'strict', path: '/api/v1/auth' })
  }
}
