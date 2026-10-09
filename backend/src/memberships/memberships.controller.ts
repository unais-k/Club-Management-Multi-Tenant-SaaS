import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Put,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { ClubId } from '../common/decorators/club-id.decorator.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import { UserRole } from '../common/enums/index.js';
import { AuthUser } from '../common/types/auth-user.js';
import { CreateMembershipDto } from './dto/create-membership.dto.js';
import { CreateMembershipPackageDto } from './dto/create-membership-package.dto.js';
import { UpdateMembershipPackageDto } from './dto/update-membership-package.dto.js';
import { AssignMembershipPackageDto } from './dto/assign-membership-package.dto.js';
import { SearchClubConsumersQueryDto } from './dto/search-club-consumers-query.dto.js';
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

  @Get('consumers')
  @ApiOperation({
    summary: 'Search existing consumers registered in this club',
    description:
      'Club Admin only. This searches consumer accounts already registered using this club context; it does not create accounts or return consumers from other clubs.',
  })
  @ApiOkResponse({
    schema: {
      example: [{ id: 'uuid', name: 'Aisha Khan', email: 'aisha@example.com' }],
    },
  })
  searchConsumers(
    @ClubId() clubId: string,
    @Query() query: SearchClubConsumersQueryDto,
  ) {
    return this.membershipsService.searchClubConsumers(clubId, query);
  }

  @Get('assignments')
  @ApiOperation({
    summary: 'List membership assignments for this club',
    description:
      'Active assignments are returned first, ordered by soonest expiry, followed by pending-payment assignments, scheduled renewals, and history. Active assignments with 5 or fewer days remaining are renewal-eligible.',
  })
  @ApiOkResponse({ description: 'Club-scoped membership assignments.' })
  listAssignments(
    @ClubId() clubId: string,
    @Query() query: SearchClubConsumersQueryDto,
  ) {
    return this.membershipsService.listAssignments(clubId, query.search);
  }

  @Get()
  @Roles(UserRole.CLUB_ADMIN, UserRole.CONSUMER)
  @ApiOperation({
    summary: 'List membership plans',
    description:
      'Club Admins manage package options under each plan. Legacy duration prices may also be returned for price-preview compatibility.',
  })
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
  @ApiOperation({ summary: 'Update a membership plan' })
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

  @Get(':id/packages')
  @ApiOperation({ summary: 'List package options for a membership plan' })
  @ApiOkResponse({ description: 'Validity, duration, quota, and numeric pricing options.' })
  @ApiNotFoundResponse({ description: 'Membership plan not found in this club.' })
  listPackages(
    @ClubId() clubId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.membershipsService.listPackages(clubId, id);
  }

  @Post(':id/packages')
  @ApiOperation({
    summary: 'Create a package option for a membership plan',
    description:
      'The fee is calculated by the backend as pricePerBooking × includedBookings. Amounts are plain numbers; display currency symbols in the client.',
  })
  @ApiCreatedResponse({ description: 'Created package option.' })
  @ApiConflictResponse({ description: 'An active option already exists for this validity and duration.' })
  createPackage(
    @ClubId() clubId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateMembershipPackageDto,
  ) {
    return this.membershipsService.createPackage(clubId, id, dto);
  }

  @Put('packages/:packageId')
  @ApiOperation({
    summary: 'Update or deactivate a membership package',
    description:
      'Terms are immutable after a package has been assigned. Deactivate it and create a replacement to preserve assignment history.',
  })
  @ApiOkResponse({ description: 'Updated package option.' })
  @ApiConflictResponse({ description: 'Package has assignments or duplicates another active option.' })
  updatePackage(
    @ClubId() clubId: string,
    @Param('packageId', ParseUUIDPipe) packageId: string,
    @Body() dto: UpdateMembershipPackageDto,
  ) {
    return this.membershipsService.updatePackage(clubId, packageId, dto);
  }

  @Post(':id/assignments')
  @ApiOperation({
    summary: 'Assign a package to a consumer',
    description:
      'Club Admin only. Allows a renewal when 5 or fewer days remain; the new assignment starts when the current assignment expires and receives a fresh quota.',
  })
  @ApiCreatedResponse({ description: 'Membership assignment created.' })
  @ApiForbiddenResponse({ description: 'Only Club Admins can assign packages.' })
  @ApiNotFoundResponse({ description: 'Consumer, plan, or package not found in this club.' })
  @ApiConflictResponse({ description: 'Consumer has an assignment that prevents this assignment.' })
  assignPackage(
    @ClubId() clubId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AssignMembershipPackageDto,
  ) {
    return this.membershipsService.assignPackage(clubId, id, dto);
  }
}
