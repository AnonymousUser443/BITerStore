import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Query, UseGuards } from '@nestjs/common'
import { ListingStatus } from '@prisma/client'
import { AuthGuard, CurrentUser, VerifiedGuard, type AuthUser } from '../../common/auth.js'
import { ListingsService } from './listings.service.js'
@Controller('listings')
export class ListingsController {
  constructor(private readonly service: ListingsService) {}
  @Get() list(@Query() query: any) { return this.service.list(query) }
  @Get('favorites/mine') @UseGuards(AuthGuard) favorites(@CurrentUser() user: AuthUser) { return this.service.favorites(user.id) }
  @Get('mine/all') @UseGuards(AuthGuard) mine(@CurrentUser() user: AuthUser, @Query() query: any) { return this.service.list({ ...query, mine: 'true' }, user.id) }
  @Get(':id') get(@Param('id') id: string) { return this.service.get(id) }
  @Post() @UseGuards(AuthGuard, VerifiedGuard) create(@CurrentUser() user: AuthUser, @Body() body: any) { return this.service.create(user.id, body) }
  @Patch(':id') @UseGuards(AuthGuard, VerifiedGuard) update(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() body: any) { return this.service.update(user.id, id, body) }
  @Delete(':id') @UseGuards(AuthGuard) remove(@CurrentUser() user: AuthUser, @Param('id') id: string) { return this.service.remove(user.id, id) }
  @Post(':id/status') @UseGuards(AuthGuard, VerifiedGuard) state(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() body: { status: ListingStatus; version: number }) { return this.service.state(user.id, id, body.status, body.version) }
  @Put(':id/favorite') @UseGuards(AuthGuard) favorite(@CurrentUser() user: AuthUser, @Param('id') id: string) { return this.service.favorite(user.id, id, true) }
  @Delete(':id/favorite') @UseGuards(AuthGuard) unfavorite(@CurrentUser() user: AuthUser, @Param('id') id: string) { return this.service.favorite(user.id, id, false) }
}
