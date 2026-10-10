/**
 * HTTP routes for club-admin court management and consumer court reads,
 * including duration settings and effective/custom opening hours.
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
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ClubId } from '../common/decorators/club-id.decorator.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import { UserRole } from '../common/enums/index.js';
import { AuthUser } from '../common/types/auth-user.js';
import { CourtsService } from './courts.service.js';
import { CreateCourtDto } from './dto/create-court.dto.js';
import { SetCourtOpeningHoursDto } from './dto/set-court-opening-hours.dto.js';
import { UpdateCourtDto } from './dto/update-court.dto.js';

@ApiTags('Courts')
@ApiBearerAuth()
@Roles(UserRole.CLUB_ADMIN)
@Controller()
export class CourtsController {
  /**
   * @param courtsService Implements tenant-scoped court and schedule operations.
   * @returns No value; Nest injects the service for route handlers.
   */
  constructor(private readonly courtsService: CourtsService) {}

  @Post('locations/:locationId/courts')
  @ApiOperation({ summary: 'Create a court in a location' })
  /**
   * Creates a court under a location in the authenticated club.
   * @param clubId Authenticated club UUID.
   * @param locationId Parent location UUID, validated by ParseUUIDPipe.
   * @param dto Court name, optional description, and optional duration subset.
   * @returns Promise of the created formatted court response.
   */
  create(
    @ClubId() clubId: string,
    @Param('locationId', ParseUUIDPipe) locationId: string,
    @Body() dto: CreateCourtDto,
  ) {
    return this.courtsService.create(clubId, locationId, dto);
  }

  @Get('locations/:locationId/courts')
  @Roles(UserRole.CLUB_ADMIN, UserRole.CONSUMER)
  @ApiOperation({ summary: 'List courts of a location' })
  /**
   * Lists courts in a location. Consumers receive active courts only.
   * @param clubId Authenticated club UUID.
   * @param user Authenticated caller; role controls active-court visibility.
   * @param locationId Parent location UUID, validated by ParseUUIDPipe.
   * @returns Promise of formatted court responses with effective hours/durations.
   */
  findByLocation(
    @ClubId() clubId: string,
    @CurrentUser() user: AuthUser,
    @Param('locationId', ParseUUIDPipe) locationId: string,
  ) {
    return this.courtsService.findByLocation(clubId, user.role, locationId);
  }

  @Get('courts/:id')
  @Roles(UserRole.CLUB_ADMIN, UserRole.CONSUMER)
  @ApiOperation({ summary: 'Get one court with its effective hours and durations' })
  /**
   * Reads one court and resolves inherited location hours/durations for the caller.
   * @param clubId Authenticated club UUID.
   * @param user Authenticated caller; inactive courts are hidden from consumers.
   * @param id Court UUID, validated by ParseUUIDPipe.
   * @returns Promise of the formatted court response or HTTP 404.
   */
  findOne(
    @ClubId() clubId: string,
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.courtsService.findOne(clubId, user.role, id);
  }

  @Put('courts/:id')
  @ApiOperation({ summary: 'Update court details, durations or active status' })
  /**
   * Updates a court's editable details, offered-duration subset, or active status.
   * @param clubId Authenticated club UUID.
   * @param id Court UUID, validated by ParseUUIDPipe.
   * @param dto Partial court fields to update.
   * @returns Promise of the updated formatted court response.
   */
  update(
    @ClubId() clubId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCourtDto,
  ) {
    return this.courtsService.update(clubId, id, dto);
  }

  @Delete('courts/:id')
  @HttpCode(204)
  @ApiOperation({ summary: 'Delete a court (soft delete)' })
  /**
   * Soft-deletes a court when no upcoming bookings depend on it.
   * @param clubId Authenticated club UUID.
   * @param id Court UUID, validated by ParseUUIDPipe.
   * @returns Promise<void>; responds 204 on success or 409 when future bookings exist.
   */
  remove(@ClubId() clubId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.courtsService.remove(clubId, id);
  }

  @Put('courts/:id/opening-hours')
  @ApiOperation({ summary: 'Set custom court hours, or go back to the location hours' })
  /**
   * Replaces a court's custom weekly hours or makes it inherit location hours.
   * @param clubId Authenticated club UUID.
   * @param id Court UUID, validated by ParseUUIDPipe.
   * @param dto Whether to use location hours and, if not, the complete custom schedule.
   * @returns Promise of the court response with its effective opening hours.
   */
  setOpeningHours(
    @ClubId() clubId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SetCourtOpeningHoursDto,
  ) {
    return this.courtsService.setOpeningHours(clubId, id, dto);
  }
}
