import { BadRequestException, Controller, ForbiddenException, Get, Post, Body, UseGuards } from '@nestjs/common'
import { AuthGuard, CurrentUser, signAccessToken, type AuthUser } from '../../common/auth.js'
import { createTotpSecret, decryptTotp, encryptTotp, verifyTotp } from '../../common/totp.js'
import { PrismaService } from '../../infra/prisma.service.js'

@Controller('admin/security') @UseGuards(AuthGuard)
export class AdminSecurityController {
  constructor(private readonly prisma: PrismaService) {}

  private async adminRecord(userId: string) {
    const record = await this.prisma.user.findUnique({ where: { id: userId } })
    if (!record || record.status !== 'ACTIVE' || record.campusStatus !== 'VERIFIED' || !['MODERATOR', 'ADMIN', 'SUPER_ADMIN'].includes(record.role)) {
      throw new ForbiddenException('需要已认证且状态正常的管理员账号')
    }
    return record
  }

  @Get('status')
  async status(@CurrentUser() user: AuthUser) {
    const record = await this.adminRecord(user.id)
    return {
      user: { id: record.id, nickname: record.nickname, role: record.role, campusStatus: record.campusStatus },
      totpEnabled: record.adminTotpEnabled
    }
  }

  @Post('totp/setup')
  async setup(@CurrentUser() user: AuthUser) {
    const record = await this.adminRecord(user.id)
    if (record.adminTotpEnabled) throw new BadRequestException('动态验证码已启用，如需重置请由服务器管理员执行安全重置')
    const secret = createTotpSecret()
    await this.prisma.user.update({ where: { id: user.id }, data: { adminTotpSecret: encryptTotp(secret), adminTotpEnabled: false } })
    return { secret, otpauthUrl: `otpauth://totp/BITerStore:${user.id}?secret=${secret}&issuer=BITerStore` }
  }

  @Post('totp/enable')
  async enable(@CurrentUser() user: AuthUser, @Body() body: { code: string }) {
    const record = await this.adminRecord(user.id)
    if (!record.adminTotpSecret || !verifyTotp(decryptTotp(record.adminTotpSecret), body.code)) throw new BadRequestException('动态验证码错误')
    await this.prisma.user.update({ where: { id: user.id }, data: { adminTotpEnabled: true } })
    return { ok: true }
  }

  @Post('totp/verify')
  async verify(@CurrentUser() user: AuthUser, @Body() body: { code: string }) {
    const record = await this.adminRecord(user.id)
    if (!record.adminTotpEnabled || !record.adminTotpSecret || !verifyTotp(decryptTotp(record.adminTotpSecret), body.code)) throw new BadRequestException('动态验证码错误或尚未启用')
    return {
      accessToken: await signAccessToken({ id: record.id, role: record.role, campusStatus: record.campusStatus }, true),
      expiresIn: Number(process.env.ACCESS_TOKEN_TTL_SECONDS || 900),
      user: { id: record.id, nickname: record.nickname, role: record.role }
    }
  }
}
