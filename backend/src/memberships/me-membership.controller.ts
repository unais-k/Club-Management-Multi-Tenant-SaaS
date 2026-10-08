import { Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe } from '@nestjs/common';
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
  @ApiOperation({ summary: 'My current membership, all active ones, and history' })
  mine(@ClubId() clubId: string, @CurrentUser() user: AuthUser) {
    return this.membershipsService.myMemberships(clubId, user.id);
  }

  @Delete(':id')
  @HttpCode(204)
  @ApiOperation({ summary: 'Cancel one of my memberships (ends immediately)' })
  cancel(
    @ClubId() clubId: string,
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.membershipsService.cancelMine(clubId, user.id, id);
  }
}