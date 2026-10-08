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
import { CreateMembershipDto } from './dto/create-membership.dto.js';
import { SetMembershipPricesDto } from './dto/set-membership-prices.dto.js';
import { UpdateMembershipDto } from './dto/update-membership.dto.js';
import { MembershipsService } from './memberships.service.js';

@ApiTags('Memberships')
@ApiBearerAuth()
@Roles(UserRole.CLUB_ADMIN)
@Controller('memberships')
export class MembershipsController {
  constructor(private readonly membershipsService: MembershipsService) {}

  @Post()
  @ApiOperation({ summary: 'Create a membership plan' })
  create(@ClubId() clubId: string, @Body() dto: CreateMembershipDto) {
    return this.membershipsService.create(clubId, dto);
  }

  @Get()
  @Roles(UserRole.CLUB_ADMIN, UserRole.CONSUMER)
  @ApiOperation({ summary: 'List membership plans with their prices' })
  findAll(@ClubId() clubId: string, @CurrentUser() user: AuthUser) {
    return this.membershipsService.findAll(clubId, user.role);
  }

  @Get(':id')
  @Roles(UserRole.CLUB_ADMIN, UserRole.CONSUMER)
  @ApiOperation({ summary: 'Get one plan (admins also see missing prices)' })
  findOne(
    @ClubId() clubId: string,
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.membershipsService.findOne(clubId, user.role, id);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update a plan (name, description, validity, active)' })
  update(
    @ClubId() clubId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateMembershipDto,
  ) {
    return this.membershipsService.update(clubId, id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  @ApiOperation({ summary: 'Delete a plan (blocked while consumers hold it)' })
  remove(@ClubId() clubId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.membershipsService.remove(clubId, id);
  }

  @Put(':id/prices')
  @ApiOperation({ summary: 'Replace the full price list of a plan' })
  setPrices(
    @ClubId() clubId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SetMembershipPricesDto,
  ) {
    return this.membershipsService.setPrices(clubId, id, dto);
  }

  @Post(':id/subscribe')
  @Roles(UserRole.CONSUMER)
  @ApiOperation({ summary: 'Subscribe to a plan (no payment in this assessment)' })
  subscribe(
    @ClubId() clubId: string,
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.membershipsService.subscribe(clubId, user.id, id);
  }
}