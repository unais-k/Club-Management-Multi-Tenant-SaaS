import { Controller, Get, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { ClubId } from '../common/decorators/club-id.decorator.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import { UserRole } from '../common/enums/index.js';
import { AuthUser } from '../common/types/auth-user.js';
import { MembershipsService } from './memberships.service.js';

@ApiTags('Memberships')
@ApiBearerAuth()
@Roles(UserRole.CONSUMER)
@Controller('me/membership')
export class MeMembershipController {
  constructor(private readonly membershipsService: MembershipsService) { }

  @Get()
  @ApiOperation({
    summary: 'Get my current and scheduled memberships plus history',
    description:
      'Membership packages are assigned by the Club Admin. Consumers cannot self-subscribe or cancel an assignment.',
  })
  mine(@ClubId() clubId: string, @CurrentUser() user: AuthUser) {
    return this.membershipsService.myMemberships(clubId, user.id);
  }

  @Post(':id/confirm-demo-payment')
  @ApiOperation({
    summary: 'Confirm demo payment for an assigned membership package',
    description:
      'Marks the package fee as SIMULATED_PAID and returns a printable receipt. This is a demo flow only: no payment provider is called and no money is collected.',
  })
  @ApiCreatedResponse({ description: 'Demo payment recorded with a receipt.' })
  @ApiConflictResponse({ description: 'The assignment was cancelled or its package is unavailable.' })
  confirmDemoPayment(
    @ClubId() clubId: string,
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.membershipsService.confirmDemoPayment(clubId, user.id, id);
  }

}
