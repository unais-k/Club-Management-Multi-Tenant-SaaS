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
  constructor(private readonly courtsService: CourtsService) {}

  @Post('locations/:locationId/courts')
  @ApiOperation({ summary: 'Create a court in a location' })
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
  findOne(
    @ClubId() clubId: string,
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.courtsService.findOne(clubId, user.role, id);
  }

  @Put('courts/:id')
  @ApiOperation({ summary: 'Update court details, durations or active status' })
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
  remove(@ClubId() clubId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.courtsService.remove(clubId, id);
  }

  @Put('courts/:id/opening-hours')
  @ApiOperation({ summary: 'Set custom court hours, or go back to the location hours' })
  setOpeningHours(
    @ClubId() clubId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SetCourtOpeningHoursDto,
  ) {
    return this.courtsService.setOpeningHours(clubId, id, dto);
  }
}