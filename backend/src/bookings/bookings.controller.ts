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
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
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
  constructor(private readonly bookingsService: BookingsService) {}

  @Post()
  @Roles(UserRole.CONSUMER)
  @ApiOperation({ summary: 'Book a court (price calculated on the server)' })
  create(
    @ClubId() clubId: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateBookingDto,
  ) {
    return this.bookingsService.create(clubId, user, dto);
  }

  @Get()
  @ApiOperation({ summary: 'List bookings (consumers: their own; club admins: the whole club)' })
  findAll(
    @ClubId() clubId: string,
    @CurrentUser() user: AuthUser,
    @Query() query: ListBookingsQueryDto,
  ) {
    return this.bookingsService.findAll(clubId, user, query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get one booking' })
  findOne(
    @ClubId() clubId: string,
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.bookingsService.findOne(clubId, user, id);
  }

  @Patch(':id/cancel')
  @HttpCode(200)
  @ApiOperation({ summary: 'Cancel a booking before it starts' })
  cancel(
    @ClubId() clubId: string,
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.bookingsService.cancel(clubId, user, id);
  }
}