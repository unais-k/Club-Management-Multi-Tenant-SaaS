/**
 * HTTP endpoints for configuring shift-based pricing and requesting price
 * quotes. All writes are Club Admin only; club admins and consumers may read
 * their club's prices/quotes.
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
  /**
   * @param pricingService Implements pricing configuration and quote calculation.
   * @returns No value; Nest injects this service into the route controller.
   */
  constructor(private readonly pricingService: PricingService) { }

  @Post('shifts')
  @ApiOperation({ summary: 'Create a pricing shift for a location' })
  /**
   * Creates a named time window whose court prices can override Normal prices.
   * @param clubId Authenticated club UUID.
   * @param dto Location UUID, shift name, and start/end times.
   * @returns Promise of the created shift response.
   */
  createShift(@ClubId() clubId: string, @Body() dto: CreateShiftDto) {
    return this.pricingService.createShift(clubId, dto);
  }

  @Get('locations/:locationId/shifts')
  @Roles(UserRole.CLUB_ADMIN, UserRole.CONSUMER)
  @ApiOperation({ summary: 'List the shifts of a location' })
  /**
   * Lists shifts for a location in start-time order.
   * @param clubId Authenticated club UUID.
   * @param user Authenticated caller; consumers can only read active locations.
   * @param locationId Location UUID validated by ParseUUIDPipe.
   * @returns Promise of formatted shift responses.
   */
  listShifts(
    @ClubId() clubId: string,
    @CurrentUser() user: AuthUser,
    @Param('locationId', ParseUUIDPipe) locationId: string,
  ) {
    return this.pricingService.listShifts(clubId, user.role, locationId);
  }

  @Put('shifts/:id')
  @ApiOperation({ summary: 'Update a shift (name or times)' })
  /**
   * Updates a shift name and/or time range after checking it does not overlap another shift.
   * @param clubId Authenticated club UUID.
   * @param id Shift UUID validated by ParseUUIDPipe.
   * @param dto Optional new name/start/end time.
   * @returns Promise of the updated shift response.
   */
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
  /**
   * Deletes a club-owned shift; database cascade removes its associated prices.
   * @param clubId Authenticated club UUID.
   * @param id Shift UUID to delete.
   * @returns Promise<void>; HTTP 204 after deletion.
   */
  removeShift(@ClubId() clubId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.pricingService.removeShift(clubId, id);
  }

  @Put('courts/:courtId')
  @ApiOperation({ summary: 'Replace the full price list of a court' })
  /**
   * Replaces the complete normal/shift-specific price list for a court.
   * @param clubId Authenticated club UUID.
   * @param courtId Court UUID validated by ParseUUIDPipe.
   * @param dto Full duration/optional shift/price entries; omitted entries are deleted.
   * @returns Promise of the saved price matrix, including missing combinations for admins.
   */
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
  /**
   * Reads current prices and shift windows for a court.
   * @param clubId Authenticated club UUID.
   * @param user Authenticated caller; role controls active-court visibility and missing-price details.
   * @param courtId Court UUID validated by ParseUUIDPipe.
   * @returns Promise of court durations, shifts, and prices; admins also receive missing combinations.
   */
  getCourtPrices(
    @ClubId() clubId: string,
    @CurrentUser() user: AuthUser,
    @Param('courtId', ParseUUIDPipe) courtId: string,
  ) {
    return this.pricingService.getCourtPrices(clubId, user.role, courtId);
  }

  @Get('quote')
  @Roles(UserRole.CLUB_ADMIN, UserRole.CONSUMER)
  @ApiOperation({
    summary: 'Calculate a booking price or list matching package prices',
    description:
      'Consumers are quoted from their assigned active package. Club Admins may omit packageId to list available package options or pass one packageId for its exact price.',
  })
  /**
   * Calculates a quote for one requested court/time/duration.
   * @param clubId Authenticated club UUID.
   * @param user Authenticated caller; consumer membership pricing uses the caller's assignment.
   * @param query Court, start, duration, and optional membership/package filters.
   * @returns Promise of quote details; shift pricing returns total and segments,
   * while membership pricing returns a package rate or matching package options.
   */
  quote(
    @ClubId() clubId: string,
    @CurrentUser() user: AuthUser,
    @Query() query: QuoteQueryDto,
  ) {
    return this.pricingService.quote(clubId, user, query);
  }
}
