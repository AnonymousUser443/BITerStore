import { BadRequestException, Controller, ForbiddenException, Post, Body, UseGuards } from '@nestjs/common'
import { AuthGuard, CurrentUser, signAccessToken, type AuthUser } from '../../common/auth.js'
import { createTotpSecret, decryptTotp, encryptTotp, verifyTotp } from '../../common/totp.js'
import { PrismaService } from '../../infra/prisma.service.js'

@Controller('admin/security') @UseGuards(AuthGuard)
export class AdminSecurityController {
  constructor(private readonly prisma: PrismaService) {}
  private assertRole(user: AuthUser) { if (!['MODERATOR', 'ADMIN', 'SUPER_ADMIN'].includes(user.role) || user.campusStatus !== 'VERIFIED') throw new ForbiddenException('需要已认证的管理员账号') }
  @Post('totp/setup') async setup(@CurrentUser() user: AuthUser) { this.assertRole(user); const secret = createTotpSecret(); await this.prisma.user.update({ where: { id: user.id }, data: { adminTotpSecret: encryptTotp(secret), adminTotpEnabled: false } }); return { secret, otpauthUrl: `otpauth://totp/BITerStore:${user.id}?secret=${secret}&issuer=BITerStore` } }
  @Post('totp/enable') async enable(@CurrentUser() user: AuthUser, @Body() body: { code: string }) { this.assertRole(user); const record = await this.prisma.user.findUniqueOrThrow({ where: { id: user.id } }); if (!record.adminTotpSecret || !verifyTotp(decryptTotp(record.adminTotpSecret), body.code)) throw new BadRequestException('动态验证码错误'); await this.prisma.user.update({ where: { id: user.id }, data: { adminTotpEnabled: true } }); return { ok: true } }
  @Post('totp/verify') async verify(@CurrentUser() user: AuthUser, @Body() body: { code: string }) { this.assertRole(user); const record = await this.prisma.user.findUniqueOrThrow({ where: { id: user.id } }); if (!record.adminTotpEnabled || !record.adminTotpSecret || !verifyTotp(decryptTotp(record.adminTotpSecret), body.code)) throw new BadRequestException('动态验证码错误或尚未启用'); return { accessToken: await signAccessToken({ id: record.id, role: record.role, campusStatus: record.campusStatus }, true), expiresIn: Number(process.env.ACCESS_TOKEN_TTL_SECONDS || 900) } }
}
