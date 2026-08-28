import { Body, Controller, Get, Post, Query, Res, UseGuards } from '@nestjs/common'
import type { FastifyReply } from 'fastify'
import { AuthGuard, CurrentUser, type AuthUser } from '../../common/auth.js'
import { AuthService } from './auth.service.js'

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}
  @Post('campus') campus(@Body() body: { registrationToken: string; platform?: string; device?: string }) { return this.auth.campus(body.registrationToken, body.platform, body.device) }
  @Post('wechat/mini-program') mini(@Body() body: { code: string; device?: string }) { return this.auth.miniProgram(body.code, body.device) }
  @Post('wechat/mini-program/bind') @UseGuards(AuthGuard) bindMini(@CurrentUser() user: AuthUser, @Body() body: { code: string }) { return this.auth.bindMiniProgram(user.id, body.code) }
  @Post('wechat/web/start') startWeb() { return this.auth.startWebLogin() }
  @Get('wechat/web/status') status(@Query('state') state: string) { return this.auth.webStatus(state) }
  @Get('wechat/web/callback') async callback(@Query('code') code: string, @Query('state') state: string, @Res() reply: FastifyReply) { await this.auth.webCallback(code, state); const h5 = (process.env.H5_ORIGIN || '').split(',')[0] || 'http://localhost:10086'; return reply.redirect(`${h5.replace(/\/$/, '')}/login?wechat=complete`) }
  @Post('refresh') async refresh(@Body() body: { refreshToken: string }, @Res({ passthrough: true }) reply: FastifyReply) { const result = await this.auth.refresh(body.refreshToken); this.cookie(reply, result.accessToken); return result }
  @Post('logout') async logout(@Body() body: { refreshToken?: string }, @Res({ passthrough: true }) reply: FastifyReply) { reply.clearCookie('biterstore_access', { path: '/' }); return this.auth.logout(body.refreshToken) }
  private cookie(reply: FastifyReply, token: string) { reply.setCookie('biterstore_access', token, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/', maxAge: Number(process.env.ACCESS_TOKEN_TTL_SECONDS || 900) }) }
}
