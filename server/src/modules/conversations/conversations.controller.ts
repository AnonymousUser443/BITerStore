import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common'
import { assertNotMuted, AuthGuard, CampusVerifiedGuard, CurrentUser, VerifiedGuard, type AuthUser } from '../../common/auth.js'
import { ConversationsService } from './conversations.service.js'
import { requiredBodyString, strictBody } from '../../common/request-validation.js'
@Controller('conversations') @UseGuards(AuthGuard)
export class ConversationsController {
  constructor(private readonly service: ConversationsService) {}
  @Get() @UseGuards(CampusVerifiedGuard) async list(@CurrentUser() user: AuthUser, @Query('cursor') cursor?: string, @Query('limit') limit?: string) {
    const page = await this.service.list(user.id, cursor, limit)
    return cursor === undefined && limit === undefined ? page.items : page
  }
  @Post() @UseGuards(VerifiedGuard) create(@CurrentUser() user: AuthUser, @Body() body: unknown) { assertNotMuted(user); const input = strictBody(body, ['listingId']); return this.service.create(user.id, requiredBodyString(input, 'listingId', '商品标识', 100)) }
  @Get(':id/messages') @UseGuards(CampusVerifiedGuard) messages(@CurrentUser() user: AuthUser, @Param('id') id: string, @Query('after') after?: string, @Query('before') before?: string, @Query('limit') limit?: string) { return this.service.messages(user.id, id, after, before, limit) }
  @Post(':id/messages') @UseGuards(VerifiedGuard) send(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() body: unknown) { assertNotMuted(user); const input = strictBody(body, ['content']); return this.service.send(user.id, id, requiredBodyString(input, 'content', '消息内容', 1000)) }
  @Post(':id/read') @UseGuards(CampusVerifiedGuard) read(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() body: unknown) { const input = strictBody(body, ['messageId']); return this.service.read(user.id, id, requiredBodyString(input, 'messageId', '消息标识', 30)) }
}
