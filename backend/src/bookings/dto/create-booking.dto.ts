/**
 * Validated JSON body for creating a court booking. The client selects a court,
 * date, start, and duration; the server determines availability and price.
 */
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsNumber, IsOptional, IsUUID, Matches, Max, Min } from 'class-validator';
import { TIME_PATTERN } from '../../common/helpers/time.js';

export class CreateBookingDto {
  /** UUID of the court to reserve; club ownership is checked by the service. */
  @ApiProperty()
  @IsUUID()
  courtId: string;

  /** Club-local booking date in YYYY-MM-DD form. */
  @ApiProperty({ example: '2026-10-13' })
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'date must be YYYY-MM-DD' })
  date: string;

  /** Requested local start time in 24-hour HH:mm form. */
  @ApiProperty({ example: '08:30' })
  @Matches(TIME_PATTERN, { message: 'startTime must be HH:mm (24-hour)' })
  startTime: string;

  /** Requested duration in minutes; it must be offered by the selected court. */
  @ApiProperty({ example: 60 })
  @IsInt()
  @Min(5)
  @Max(480)
  durationMinutes: number;

  /** Optional price the client displayed; a changed server quote returns HTTP 409. */
  @ApiPropertyOptional({
    example: 17.5,
    description: 'The price the user saw. If the real price differs, the booking is rejected with 409.',
  })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  expectedPrice?: number;
}
