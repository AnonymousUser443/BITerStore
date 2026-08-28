import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException, createParamDecorator } from '@nestjs/common'
import { SignJWT, jwtVerify } from 'jose'

export interface AuthUser { id: string; role: 'USER' | 'MODERATOR' | 'ADMIN' | 'SUPER_ADMIN'; campusStatus: string; adminTotp?: boolean }
const secret = () => new TextEncoder().encode(process.env.ACCESS_TOKEN_SECRET || 'development-only-secret-change-me')

export async function signAccessToken(user: AuthUser, adminTotp = false) {
  return new SignJWT({ role: user.role, campusStatus: user.campusStatus, adminTotp }).setProtectedHeader({ alg: 'HS256' }).setSubject(user.id).setIssuedAt().setExpirationTime(`${Number(process.env.ACCESS_TOKEN_TTL_SECONDS || 900)}s`).sign(secret())
}

@Injectable()
export class AuthGuard implements CanActivate {
  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest()
    const bearer = String(request.headers.authorization || '').replace(/^Bearer\s+/i, '')
    const token = bearer || request.cookies?.biterstore_access
    if (!token) throw new UnauthorizedException('需要登录')
    try {
      const { payload } = await jwtVerify(token, secret())
      request.user = { id: payload.sub, role: payload.role, campusStatus: payload.campusStatus, adminTotp: payload.adminTotp === true }
      return true
    } catch { throw new UnauthorizedException('登录已失效') }
  }
}

@Injectable()
export class VerifiedGuard implements CanActivate {
  canActivate(context: ExecutionContext) {
    const user = context.switchToHttp().getRequest().user as AuthUser
    if (user?.campusStatus !== 'VERIFIED') throw new ForbiddenException('完成校园身份认证后才能操作')
    return true
  }
}

@Injectable()
export class AdminGuard implements CanActivate {
  canActivate(context: ExecutionContext) {
    const user = context.switchToHttp().getRequest().user as AuthUser
    if (!['MODERATOR', 'ADMIN', 'SUPER_ADMIN'].includes(user?.role)) throw new ForbiddenException('没有后台权限')
    if (!user.adminTotp) throw new ForbiddenException('需要管理员动态验证码')
    return true
  }
}

export const CurrentUser = createParamDecorator((_data, context: ExecutionContext) => context.switchToHttp().getRequest().user as AuthUser)
