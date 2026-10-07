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
import { CreateShiftDto } from './dto/create-shift.dto.js';
import { QuoteQueryDto } from './dto/quote-query.dto.js';
import { SetCourtPricesDto } from './dto/set-court-prices.dto.js';
import { UpdateShiftDto } from './dto/update-shift.dto.js';
import { PricingService } from './pricing.service.js';

@ApiTags('Pricing')
@ApiBearerAuth()
@Roles(UserRole.CLUB_ADMIN)
@Controller('pricing')
export class PricingController {
  constructor(private readonly pricingService: PricingService) {}

  @Post('shifts')
  @ApiOperation({ summary: 'Create a pricing shift for a location' })
  createShift(@ClubId() clubId: string, @Body() dto: CreateShiftDto) {
    return this.pricingService.createShift(clubId, dto);
  }

  @Get('locations/:locationId/shifts')
  @Roles(UserRole.CLUB_ADMIN, UserRole.CONSUMER)
  @ApiOperation({ summary: 'List the shifts of a location' })
  listShifts(
    @ClubId() clubId: string,
    @CurrentUser() user: AuthUser,
    @Param('locationId', ParseUUIDPipe) locationId: string,
  ) {
    return this.pricingService.listShifts(clubId, user.role, locationId);
  }

  @Put('shifts/:id')
  @ApiOperation({ summary: 'Update a shift (name or times)' })
  updateShift(
    @ClubId() clubId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateShiftDto,
  ) {
    return this.pricingService.updateShift(clubId, id, dto);
  }

  @Delete('shifts/:id')
  @HttpCode(204)
  @ApiOperation({ summary: 'Delete a shift and its prices' })
  removeShift(@ClubId() clubId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.pricingService.removeShift(clubId, id);
  }

  @Put('courts/:courtId')
  @ApiOperation({ summary: 'Replace the full price list of a court' })
  setCourtPrices(
    @ClubId() clubId: string,
    @Param('courtId', ParseUUIDPipe) courtId: string,
    @Body() dto: SetCourtPricesDto,
  ) {
    return this.pricingService.setCourtPrices(clubId, courtId, dto);
  }

  @Get('courts/:courtId')
  @Roles(UserRole.CLUB_ADMIN, UserRole.CONSUMER)
  @ApiOperation({ summary: 'Get a court price list (admins also see missing prices)' })
  getCourtPrices(
    @ClubId() clubId: string,
    @CurrentUser() user: AuthUser,
    @Param('courtId', ParseUUIDPipe) courtId: string,
  ) {
    return this.pricingService.getCourtPrices(clubId, user.role, courtId);
  }

  @Get('quote')
  @Roles(UserRole.CLUB_ADMIN, UserRole.CONSUMER)
  @ApiOperation({ summary: 'Calculate the price for a court, start time and duration' })
  quote(
    @ClubId() clubId: string,
    @CurrentUser() user: AuthUser,
    @Query() query: QuoteQueryDto,
  ) {
    return this.pricingService.quote(clubId, user.role, query);
  }
}