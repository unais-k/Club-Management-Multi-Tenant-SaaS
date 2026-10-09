import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
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
  constructor(private readonly membershipsService: MembershipsService) {}

  @Get()
  @ApiOperation({
    summary: 'Get my current and scheduled memberships plus history',
    description:
      'Membership packages are assigned by the Club Admin. Consumers cannot self-subscribe or cancel an assignment.',
  })
  mine(@ClubId() clubId: string, @CurrentUser() user: AuthUser) {
    return this.membershipsService.myMemberships(clubId, user.id);
  }

}
