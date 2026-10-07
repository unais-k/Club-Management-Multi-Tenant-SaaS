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
@ApiTags('Tenants')
@ApiBearerAuth()
@Roles(UserRole.PLATFORM_ADMIN)
@Controller('tenants')

export class TenantsController {
  constructor(private readonly tenantsService: TenantsService) { }

  @Post()
  @ApiOperation({ summary: 'Create a club and its first club admin' })
  create(@Body() dto: CreateTenantDto) {
    return this.tenantsService.create(dto);
  }

  @Get()
  @ApiOperation({ summary: 'List clubs (paginated, searchable)' })
  findAll(@Query() query: ListTenantsQueryDto) {
    return this.tenantsService.findAll(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get one club' })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.tenantsService.findOne(id);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update club name/timezone' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateTenantDto,
  ) {
    return this.tenantsService.update(id, dto);
  }

  @Patch(':id/status')
  @ApiOperation({ summary: 'Activate or deactivate a club' })
  updateStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateTenantStatusDto,
  ) {
    return this.tenantsService.setStatus(id, dto.isActive);
  }
}

