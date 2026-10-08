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
  constructor(private readonly locationsService: LocationsService) { }

  @Post()
  @ApiOperation({ summary: 'Create a location' })
  create(@ClubId() clubId: string, @Body() dto: CreateLocationDto) {
    return this.locationsService.create(clubId, dto);
  }

  @Get()
  @Roles(UserRole.CLUB_ADMIN, UserRole.CONSUMER)
  @ApiOperation({ summary: 'List locations of my club' })
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
  findOne(
    @ClubId() clubId: string,
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.locationsService.findOne(clubId, user.role, id);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update location details, durations or status' })
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
  remove(@ClubId() clubId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.locationsService.remove(clubId, id);
  }

  @Put(':id/opening-hours')
  @ApiOperation({ summary: 'Replace the weekly opening hours' })
  setOpeningHours(
    @ClubId() clubId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SetOpeningHoursDto,
  ) {
    return this.locationsService.setOpeningHours(clubId, id, dto);
  }

  @Post(':id/unavailable-periods')
  @ApiOperation({ summary: 'Add an unavailable period' })
  addUnavailablePeriod(
    @ClubId() clubId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateUnavailablePeriodDto,
  ) {
    return this.locationsService.addUnavailablePeriod(clubId, id, dto);
  }

  @Get(':id/unavailable-periods')
  @ApiOperation({ summary: 'List unavailable periods' })
  listUnavailablePeriods(
    @ClubId() clubId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.locationsService.listUnavailablePeriods(clubId, id);
  }

  @Delete(':id/unavailable-periods/:periodId')
  @HttpCode(204)
  @ApiOperation({ summary: 'Remove an unavailable period' })
  removeUnavailablePeriod(
    @ClubId() clubId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('periodId', ParseUUIDPipe) periodId: string,
  ) {
    return this.locationsService.removeUnavailablePeriod(clubId, id, periodId);
  }
}