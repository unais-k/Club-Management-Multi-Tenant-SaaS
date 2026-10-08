import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsUUID, Matches } from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto.js';
import { BookingStatus } from '../../common/enums/index.js';

export enum BookingPeriod {
  UPCOMING = 'upcoming', // not yet ended
  PAST = 'past', // already ended
}

export class ListBookingsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: BookingStatus })
  @IsOptional()
  @IsEnum(BookingStatus)
  status?: BookingStatus;

  @ApiPropertyOptional({ enum: BookingPeriod })
  @IsOptional()
  @IsEnum(BookingPeriod)
  period?: BookingPeriod;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  locationId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  courtId?: string;

  @ApiPropertyOptional({ example: '2026-10-01' })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'dateFrom must be YYYY-MM-DD' })
  dateFrom?: string;

  @ApiPropertyOptional({ example: '2026-10-31' })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'dateTo must be YYYY-MM-DD' })
  dateTo?: string;
}