/**
 * HTTP endpoints for club-admin location management and consumer-visible location
 * reads: CRUD, weekly hours, and date-specific unavailable periods.
 */
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ClubId } from '../common/decorators/club-id.decorator.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import { UserRole } from '../common/enums/index.js';
import { AuthUser } from '../common/types/auth-user.js';
import { CreateLocationDto } from './dto/create-location.dto.js';
import { CreateUnavailablePeriodDto } from './dto/create-unavailable-period.dto.js';
import { ListLocationsQueryDto } from './dto/list-locations-query.dto.js';
import { SetOpeningHoursDto } from './dto/set-opening-hours.dto.js';
import { UpdateLocationDto } from './dto/update-location.dto.js';
import { LocationsService } from './locations.service.js';

@ApiTags('Locations')
@ApiBearerAuth()
@Roles(UserRole.CLUB_ADMIN)
@Controller('locations')
export class LocationsController {
  /**
   * @param locationsService Implements tenant-scoped location/schedule operations.
   * @returns No value; Nest injects the service for this controller's routes.
   */
  constructor(private readonly locationsService: LocationsService) { }

  @Post()
  @ApiOperation({ summary: 'Create a location' })
  /**
   * Creates a location for the authenticated club.
   * @param clubId Club UUID extracted from the authenticated account.
   * @param dto Location name/address/details and supported durations.
   * @returns Promise of the new formatted location response.
   */
  create(@ClubId() clubId: string, @Body() dto: CreateLocationDto) {
    return this.locationsService.create(clubId, dto);
  }

  @Get()
  @Roles(UserRole.CLUB_ADMIN, UserRole.CONSUMER)
  @ApiOperation({ summary: 'List locations of my club' })
  /**
   * Lists locations in the caller's club, with pagination and optional search.
   * @param clubId Authenticated club UUID used for tenant isolation.
   * @param user Authenticated user; consumers only receive active locations.
   * @param query Page, page size, and optional location-name search string.
   * @returns Promise of `{ data, meta }` with formatted locations and pagination totals.
   */
  findAll(
    @ClubId() clubId: string,
    @CurrentUser() user: AuthUser,
    @Query() query: ListLocationsQueryDto,
  ) {
    return this.locationsService.findAll(clubId, user.role, query);
  }

  @Get(':id')
  @Roles(UserRole.CLUB_ADMIN, UserRole.CONSUMER)
  @ApiOperation({ summary: 'Get a location with its opening hours' })
  /**
   * Reads one location and its weekly opening hours within the authenticated club.
   * @param clubId Authenticated club UUID.
   * @param user Authenticated user; consumers cannot read inactive locations.
   * @param id Location UUID from the URL, validated by ParseUUIDPipe.
   * @returns Promise of a formatted location response or HTTP 404.
   */
  findOne(
    @ClubId() clubId: string,
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.locationsService.findOne(clubId, user.role, id);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update location details, durations or status' })
  /**
   * Updates a location's editable details, offered durations, or active status.
   * @param clubId Authenticated club UUID.
   * @param id Location UUID from the URL, validated by ParseUUIDPipe.
   * @param dto Partial set of mutable location fields.
   * @returns Promise of the updated formatted location response.
   */
  update(
    @ClubId() clubId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateLocationDto,
  ) {
    return this.locationsService.update(clubId, id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  @ApiOperation({ summary: 'Delete a location (soft delete)' })
  /**
   * Soft-deletes a location and its courts if no upcoming bookings depend on it.
   * @param clubId Authenticated club UUID.
   * @param id Location UUID to remove, validated by ParseUUIDPipe.
   * @returns Promise<void>; HTTP 204 on success or HTTP 409 if upcoming bookings exist.
   */
  remove(@ClubId() clubId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.locationsService.remove(clubId, id);
  }

  @Put(':id/opening-hours')
  @ApiOperation({ summary: 'Replace the weekly opening hours' })
  /**
   * Replaces the full weekly opening-hour schedule for a location.
   * @param clubId Authenticated club UUID.
   * @param id Location UUID whose hours are being changed.
   * @param dto Complete weekly schedule; omitted days are treated as closed.
   * @returns Promise of the location response with the saved opening hours.
   */
  setOpeningHours(
    @ClubId() clubId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SetOpeningHoursDto,
  ) {
    return this.locationsService.setOpeningHours(clubId, id, dto);
  }

  @Post(':id/unavailable-periods')
  @ApiOperation({ summary: 'Add an unavailable period' })
  /**
   * Adds a date-specific closure period to a location.
   * @param clubId Authenticated club UUID.
   * @param id Parent location UUID.
   * @param dto Date, start/end time, and optional reason for the closure.
   * @returns Promise of the created closure response.
   */
  addUnavailablePeriod(
    @ClubId() clubId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateUnavailablePeriodDto,
  ) {
    return this.locationsService.addUnavailablePeriod(clubId, id, dto);
  }

  @Get(':id/unavailable-periods')
  @ApiOperation({ summary: 'List unavailable periods' })
  /**
   * Lists all date-specific closure periods for a location.
   * @param clubId Authenticated club UUID.
   * @param id Location UUID whose closures are requested.
   * @returns Promise of closure responses ordered by date and start time.
   */
  listUnavailablePeriods(
    @ClubId() clubId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.locationsService.listUnavailablePeriods(clubId, id);
  }

  @Delete(':id/unavailable-periods/:periodId')
  @HttpCode(204)
  @ApiOperation({ summary: 'Remove an unavailable period' })
  /**
   * Removes one closure belonging to the given club and location.
   * @param clubId Authenticated club UUID.
   * @param id Parent location UUID.
   * @param periodId Closure UUID to delete; both UUIDs are validated by ParseUUIDPipe.
   * @returns Promise<void>; HTTP 204 on success or HTTP 404 if not found under that location.
   */
  removeUnavailablePeriod(
    @ClubId() clubId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('periodId', ParseUUIDPipe) periodId: string,
  ) {
    return this.locationsService.removeUnavailablePeriod(clubId, id, periodId);
  }
}
