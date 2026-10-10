/**
 * Query parameters for listing bookings. Extends shared pagination with status,
 * period, facility, court, and date-range filters.
 */
import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsUUID, Matches } from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto.js';
import { BookingStatus } from '../../common/enums/index.js';

/** Relative-to-now grouping used to order and filter bookings. */
export enum BookingPeriod {
  UPCOMING = 'upcoming', // not yet ended
  PAST = 'past', // already ended
}

export class ListBookingsQueryDto extends PaginationQueryDto {
  /** Optional booking lifecycle filter (confirmed or cancelled). */
  @ApiPropertyOptional({ enum: BookingStatus })
  @IsOptional()
  @IsEnum(BookingStatus)
  status?: BookingStatus;

  /** Optional relative period: upcoming means not ended; past means already ended. */
  @ApiPropertyOptional({ enum: BookingPeriod })
  @IsOptional()
  @IsEnum(BookingPeriod)
  period?: BookingPeriod;

  /** Optional location UUID to limit results to one location. */
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  locationId?: string;

  /** Optional court UUID to limit results to one court. */
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  courtId?: string;

  /** Optional inclusive lower bound for the booking date. */
  @ApiPropertyOptional({ example: '2026-10-01' })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'dateFrom must be YYYY-MM-DD' })
  dateFrom?: string;

  /** Optional inclusive upper bound for the booking date. */
  @ApiPropertyOptional({ example: '2026-10-31' })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'dateTo must be YYYY-MM-DD' })
  dateTo?: string;
}
