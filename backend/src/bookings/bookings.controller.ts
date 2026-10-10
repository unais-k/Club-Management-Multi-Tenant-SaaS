/**
 * HTTP endpoints for consumers and club administrators to create, list, view,
 * and cancel bookings. Club scope and identity come from authenticated request
 * decorators rather than client-supplied tenant/user ids.
 */
import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { ClubId } from '../common/decorators/club-id.decorator.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import { UserRole } from '../common/enums/index.js';
import { AuthUser } from '../common/types/auth-user.js';
import { BookingsService } from './bookings.service.js';
import { CreateBookingDto } from './dto/create-booking.dto.js';
import { ListBookingsQueryDto } from './dto/list-bookings-query.dto.js';

@ApiTags('Bookings')
@ApiBearerAuth()
@Roles(UserRole.CONSUMER, UserRole.CLUB_ADMIN)
@Controller('bookings')
export class BookingsController {
  /**
   * @param bookingsService Booking rules, persistence, and response formatting.
   * @returns No value; Nest injects the service for the route handlers.
   */
  constructor(private readonly bookingsService: BookingsService) {}

  @Post()
  @Roles(UserRole.CONSUMER)
  @ApiOperation({
    summary: 'Book a court (price calculated on the server)',
    description:
      'Membership-based bookings use one credit from the assigned package. The server checks the package duration and remaining quota again inside the booking transaction.',
  })
  /**
   * Creates a confirmed booking after server-side availability, pricing, and
   * membership-credit checks.
   * @param clubId Authenticated club UUID supplied by @ClubId.
   * @param user Authenticated account identity/role supplied by @CurrentUser.
   * @param dto Court, date, start time, duration, and optional expected price.
   * @returns Promise of the created booking response, including calculated
   * price, court/location summary, membership label, and cancellation eligibility.
   */
  create(
    @ClubId() clubId: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateBookingDto,
  ) {
    return this.bookingsService.create(clubId, user, dto);
  }

  @Get()
  @ApiOperation({ summary: 'List bookings (consumers: their own; club admins: the whole club)' })
  /**
   * Lists bookings visible to the caller, with optional status/location/court/
   * date/period filters and pagination.
   * @param clubId Authenticated club UUID, used to isolate the query.
   * @param user Authenticated account; consumers are restricted to their own rows.
   * @param query Validated filter and pagination query parameters.
   * @returns Promise of `{ data, meta }`; each row is a booking response and meta
   * contains total/page/limit/totalPages.
   */
  findAll(
    @ClubId() clubId: string,
    @CurrentUser() user: AuthUser,
    @Query() query: ListBookingsQueryDto,
  ) {
    return this.bookingsService.findAll(clubId, user, query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get one booking' })
  /**
   * Returns one booking only if it belongs to the authenticated club and is
   * visible to the caller.
   * @param clubId Authenticated club UUID, used for tenant isolation.
   * @param user Authenticated account; consumers may only fetch their own bookings.
   * @param id Booking UUID from the URL, validated by ParseUUIDPipe.
   * @returns Promise of one formatted booking response; otherwise HTTP 404.
   */
  findOne(
    @ClubId() clubId: string,
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.bookingsService.findOne(clubId, user, id);
  }

  @Patch(':id/cancel')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Cancel a booking more than 30 minutes before it starts',
    description:
      'For membership bookings, a successful cancellation restores one package booking credit. Cancellation is rejected when 30 minutes or less remain.',
  })
  @ApiConflictResponse({
    description:
      'Booking is already cancelled, has started, or is within 30 minutes of its start.',
  })
  /**
   * Cancels a visible confirmed booking when its start is more than 30 minutes away.
   * For membership bookings, the cancellation returns one credit because quota
   * counts only confirmed bookings.
   * @param clubId Authenticated club UUID, used for tenant isolation.
   * @param user Authenticated account; consumers can cancel only their bookings.
   * @param id Booking UUID from the URL, validated by ParseUUIDPipe.
   * @returns Promise of the formatted cancelled booking; disallowed cancellations
   * return HTTP 409.
   */
  cancel(
    @ClubId() clubId: string,
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.bookingsService.cancel(clubId, user, id);
  }
}
