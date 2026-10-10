/** Authenticated HTTP endpoint for finding bookable court slots and their prices. */
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
  /**
   * @param availabilityService Loads schedules and calculates available slots.
   * @returns No value; Nest injects the availability service.
   */
  constructor(private readonly availabilityService: AvailabilityService) {}

  @Get()
  @ApiOperation({
    summary: 'Bookable slots and applicable membership package pricing',
    description:
      'Consumers receive their assigned package rate when it matches the requested duration and has remaining credits. Club Admins receive available package prices.',
  })
  /**
   * Gets available slots for the requested location/date/duration.
   * @param clubId Authenticated club UUID.
   * @param user Authenticated caller; role determines visibility and price source.
   * @param query Validated location/date/duration and optional admin package filters.
   * @returns Promise of location summary, pricing metadata, and available slots per court.
   */
  getAvailability(
    @ClubId() clubId: string,
    @CurrentUser() user: AuthUser,
    @Query() query: AvailabilityQueryDto,
  ) {
    return this.availabilityService.getAvailability(clubId, user, query);
  }
}
