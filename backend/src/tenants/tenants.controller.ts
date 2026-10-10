/**
 * HTTP routes for platform administrators to create, inspect, update, and
 * activate/deactivate clubs. The class-level role requirement protects every route.
 */
import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Roles } from '../common/decorators/roles.decorator.js';
import { UserRole } from '../common/enums/index.js';
import { CreateTenantDto } from './dto/create-tenant.dto.js';
import { ListTenantsQueryDto } from './dto/list-tenants-query.dto.js';
import { UpdateTenantStatusDto } from './dto/update-tenant-status.dto.js';
import { UpdateTenantDto } from './dto/update-tenant.dto.js';
import { TenantsService } from './tenants.service.js';

@ApiTags('Tenants')
@Controller('tenants')
@ApiBearerAuth()
@Roles(UserRole.PLATFORM_ADMIN)

export class TenantsController {
  /**
   * @param tenantsService Service that implements tenant lookup and changes.
   * @returns No value; Nest injects and stores the service for route handlers.
   */
  constructor(private readonly tenantsService: TenantsService) { }

  @Post()
  @ApiOperation({ summary: 'Create a club and its first club admin' })
  /**
   * Creates a club together with its initial club-admin account.
   * @param dto Validated club details, pricing model, and first admin credentials.
   * @returns Promise of the created Tenant record; duplicate slugs return HTTP 409.
   */
  create(@Body() dto: CreateTenantDto) {
    return this.tenantsService.create(dto);
  }

  @Get()
  @ApiOperation({ summary: 'List clubs (paginated, searchable)' })
  /**
   * Returns a searchable, paginated list of clubs.
   * @param query Page, page size, and optional club-name search string.
   * @returns Promise of `{ data, meta }`, where `meta` contains total/page/limit/
   * totalPages; for example `{ data: [tenant], meta: { total: 1, page: 1, limit: 10, totalPages: 1 } }`.
   */
  findAll(@Query() query: ListTenantsQueryDto) {
    return this.tenantsService.findAll(query);
  }

  @Get(':id/operations')
  @ApiOperation({
    summary: 'Get a club schedule and pricing overview for the platform admin',
  })
  /**
   * Returns an operational overview for one club, including its next seven
   * local calendar days, facilities, weekly hours, prices, and closures.
   * @param id Club UUID from the URL; ParseUUIDPipe rejects malformed values.
   * @returns Promise of `{ tenant, membershipPlans, dateRange, locations,
   * upcomingUnavailablePeriods }`; each location includes court and pricing details.
   */
  getOperations(@Param('id', ParseUUIDPipe) id: string) {
    return this.tenantsService.getOperations(id);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get one club' })
  /**
   * Reads one club by its UUID.
   * @param id Club UUID from the URL, validated by ParseUUIDPipe.
   * @returns Promise of the Tenant entity; missing clubs return HTTP 404.
   */
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.tenantsService.findOne(id);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update club name/timezone' })
  /**
   * Updates editable club identity settings.
   * @param id Club UUID from the URL, validated by ParseUUIDPipe.
   * @param dto Optional new club name and/or timezone; slug and pricing model
   * cannot be changed after creation.
   * @returns Promise of the saved Tenant entity; missing clubs return HTTP 404.
   */
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateTenantDto,
  ) {
    return this.tenantsService.update(id, dto);
  }

  @Patch(':id/status')
  @ApiOperation({ summary: 'Activate or deactivate a club' })
  /**
   * Changes whether a club is active.
   * @param id Club UUID from the URL, validated by ParseUUIDPipe.
   * @param dto Body containing the boolean `isActive` value.
   * @returns Promise of the saved Tenant entity with its updated status.
   */
  updateStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateTenantStatusDto,
  ) {
    return this.tenantsService.setStatus(id, dto.isActive);
  }
}

