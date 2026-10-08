import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ClubId } from '../common/decorators/club-id.decorator.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import { UserRole } from '../common/enums/index.js';
import { AuthUser } from '../common/types/auth-user.js';
import { AvailabilityService } from './availability.service.js';
import { AvailabilityQueryDto } from './dto/availability-query.dto.js';

@ApiTags('Availability')
@ApiBearerAuth()
@Roles(UserRole.CLUB_ADMIN, UserRole.CONSUMER)
@Controller('availability')
export class AvailabilityController {
  constructor(private readonly availabilityService: AvailabilityService) {}

  @Get()
  @ApiOperation({ summary: 'Bookable slots (with prices) per court for a location, date and duration' })
  getAvailability(
    @ClubId() clubId: string,
    @CurrentUser() user: AuthUser,
    @Query() query: AvailabilityQueryDto,
  ) {
    return this.availabilityService.getAvailability(clubId, user, query);
  }
}