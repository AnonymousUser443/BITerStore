import { createHash } from 'node:crypto'
import { Body, Controller, Delete, Get, Header, Param, Patch, Post, Put, Query, Req, Res, UseGuards } from '@nestjs/common'
import type { FastifyReply, FastifyRequest } from 'fastify'
import { assertNotMuted, AuthGuard, CurrentUser, NotMutedGuard, VerifiedGuard, type AuthUser } from '../../common/auth.js'
import { ListingsService } from './listings.service.js'
import { PublicCatalogRateLimitGuard } from './public-catalog-rate-limit.guard.js'
@Controller('listings')
export class ListingsController {
  constructor(private readonly service: ListingsService) {}
  @Get() @UseGuards(PublicCatalogRateLimitGuard) @Header('Cache-Control', 'public, max-age=15, stale-while-revalidate=30')
  async list(@Query() query: Record<string, unknown>, @Req() request: FastifyRequest, @Res({ passthrough: true }) reply: FastifyReply) {
    return publicEtag(request.headers['if-none-match'], reply, await this.service.list(query))
  }
  @Get('favorites/mine') @UseGuards(AuthGuard) favorites(@CurrentUser() user: AuthUser) { return this.service.favorites(user.id) }
  @Get('mine/count') @UseGuards(AuthGuard) mineCount(@CurrentUser() user: AuthUser) { return this.service.countMine(user.id) }
  @Get('mine/all') @UseGuards(AuthGuard) mine(@CurrentUser() user: AuthUser, @Query() query: any) { return this.service.list({ ...query, mine: 'true' }, user.id) }
  @Get('mine/:id') @UseGuards(AuthGuard) mineOne(@CurrentUser() user: AuthUser, @Param('id') id: string) { return this.service.getMine(user.id, id) }
  @Get(':id') @UseGuards(PublicCatalogRateLimitGuard) @Header('Cache-Control', 'public, max-age=30, stale-while-revalidate=30')
  async get(@Param('id') id: string, @Req() request: FastifyRequest, @Res({ passthrough: true }) reply: FastifyReply) {
    return publicEtag(request.headers['if-none-match'], reply, await this.service.get(id))
  }
  @Post() @UseGuards(AuthGuard, VerifiedGuard) create(@CurrentUser() user: AuthUser, @Body() body: unknown) { assertNotMuted(user); return this.service.create(user.id, body) }
  @Patch(':id') @UseGuards(AuthGuard, VerifiedGuard) update(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() body: unknown) { assertNotMuted(user); return this.service.update(user.id, id, body) }
  @Delete(':id') @UseGuards(AuthGuard, NotMutedGuard) remove(@CurrentUser() user: AuthUser, @Param('id') id: string) { assertNotMuted(user); return this.service.remove(user.id, id) }
  @Post(':id/status') @UseGuards(AuthGuard, VerifiedGuard) state(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() body: unknown) { assertNotMuted(user); return this.service.state(user.id, id, body) }
  @Put(':id/favorite') @UseGuards(AuthGuard, NotMutedGuard) favorite(@CurrentUser() user: AuthUser, @Param('id') id: string) { assertNotMuted(user); return this.service.favorite(user.id, id, true) }
  @Delete(':id/favorite') @UseGuards(AuthGuard, NotMutedGuard) unfavorite(@CurrentUser() user: AuthUser, @Param('id') id: string) { assertNotMuted(user); return this.service.favorite(user.id, id, false) }
}

export function publicEtag(ifNoneMatch: string | string[] | undefined, reply: Pick<FastifyReply, 'header' | 'status'>, value: unknown) {
  const etag = `"${createHash('sha256').update(JSON.stringify(value)).digest('base64url')}"`
  reply.header('ETag', etag)
  const requested = (Array.isArray(ifNoneMatch) ? ifNoneMatch.join(',') : ifNoneMatch || '')
    .split(',').map((candidate) => candidate.trim().replace(/^W\//, ''))
  if (requested.includes('*') || requested.includes(etag)) {
    reply.status(304)
    return undefined
  }
  return value
}
