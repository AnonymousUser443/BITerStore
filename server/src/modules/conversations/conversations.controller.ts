import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common'
import { assertNotMuted, AuthGuard, CampusVerifiedGuard, CurrentUser, VerifiedGuard, type AuthUser } from '../../common/auth.js'
import { ConversationsService } from './conversations.service.js'
@Controller('conversations') @UseGuards(AuthGuard)
export class ConversationsController {
  constructor(private readonly service: ConversationsService) {}
  @Get() @UseGuards(CampusVerifiedGuard) list(@CurrentUser() user: AuthUser) { return this.service.list(user.id) }
  @Post() @UseGuards(VerifiedGuard) create(@CurrentUser() user: AuthUser, @Body() body: { listingId: string }) { assertNotMuted(user); return this.service.create(user.id, body.listingId) }
  @Get(':id/messages') @UseGuards(CampusVerifiedGuard) messages(@CurrentUser() user: AuthUser, @Param('id') id: string, @Query('after') after?: string, @Query('limit') limit?: string) { return this.service.messages(user.id, id, after, limit) }
  @Post(':id/messages') @UseGuards(VerifiedGuard) send(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() body: { content: string }) { assertNotMuted(user); return this.service.send(user.id, id, body.content) }
  @Post(':id/read') @UseGuards(CampusVerifiedGuard) read(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() body: { messageId: string }) { return this.service.read(user.id, id, body.messageId) }
}
