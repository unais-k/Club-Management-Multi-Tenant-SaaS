/**
 * Validated body for adding a one-date location closure or blocked time range.
 */
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import { TIME_PATTERN } from '../../common/helpers/time.js';

export class CreateUnavailablePeriodDto {
  /** Club-local calendar date in YYYY-MM-DD format. */
  @ApiProperty({ example: '2026-12-25' })
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'date must be YYYY-MM-DD' })
  date: string;

  /** Start of the blocked interval in 24-hour HH:mm format. */
  @ApiProperty({ example: '10:00' })
  @Matches(TIME_PATTERN, { message: 'startTime must be HH:mm (24-hour)' })
  startTime: string;

  /** Exclusive end of the blocked interval in 24-hour HH:mm format. */
  @ApiProperty({ example: '15:00' })
  @Matches(TIME_PATTERN, { message: 'endTime must be HH:mm (24-hour)' })
  endTime: string;

  /** Optional reason displayed to administrators. */
  @ApiPropertyOptional({ example: 'Christmas Event' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  reason?: string;
}
