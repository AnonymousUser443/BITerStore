import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common'
import { AuthGuard, CurrentUser, type AuthUser } from '../../common/auth.js'
import { IdentityService } from './identity.service.js'
@Controller('identity/campus') @UseGuards(AuthGuard)
export class IdentityController {
  constructor(private readonly service: IdentityService) {}
  @Post('exchange') exchange(@CurrentUser() user: AuthUser, @Body() body: { registrationToken: string }) { return this.service.exchange(user.id, body.registrationToken) }
  @Get('status') status(@CurrentUser() user: AuthUser) { return this.service.status(user.id) }
}
