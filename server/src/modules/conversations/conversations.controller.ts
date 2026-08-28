import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common'
import { AuthGuard, CurrentUser, VerifiedGuard, type AuthUser } from '../../common/auth.js'
import { ConversationsService } from './conversations.service.js'
@Controller('conversations') @UseGuards(AuthGuard, VerifiedGuard)
export class ConversationsController {
  constructor(private readonly service: ConversationsService) {}
  @Get() list(@CurrentUser() user: AuthUser) { return this.service.list(user.id) }
  @Post() create(@CurrentUser() user: AuthUser, @Body() body: { listingId: string }) { return this.service.create(user.id, body.listingId) }
  @Get(':id/messages') messages(@CurrentUser() user: AuthUser, @Param('id') id: string, @Query('after') after?: string, @Query('limit') limit?: string) { return this.service.messages(user.id, id, after, limit) }
  @Post(':id/messages') send(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() body: { content: string }) { return this.service.send(user.id, id, body.content) }
  @Post(':id/read') read(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() body: { messageId: string }) { return this.service.read(user.id, id, body.messageId) }
}
