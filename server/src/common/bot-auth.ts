import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common'
import { timingSafeEqual } from 'node:crypto'

function tokenMatches(presented: string, expected: string) {
  const actual = Buffer.from(presented)
  const configured = Buffer.from(expected)
  return actual.length === configured.length && timingSafeEqual(actual, configured)
}

@Injectable()
export class BotGuard implements CanActivate {
  canActivate(context: ExecutionContext) {
    const expected = process.env.BOT_API_TOKEN?.trim()
    const request = context.switchToHttp().getRequest<{ headers?: Record<string, unknown> }>()
    const presented = String(request.headers?.authorization || '').replace(/^Bearer\s+/i, '').trim()
    if (!expected || !presented || !tokenMatches(presented, expected)) throw new UnauthorizedException('机器人鉴权失败')
    return true
  }
}
