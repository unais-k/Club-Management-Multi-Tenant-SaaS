import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsNumber, IsOptional, IsUUID, Matches, Max, Min } from 'class-validator';
import { TIME_PATTERN } from '../../common/helpers/time.js';

export class CreateBookingDto {
  @ApiProperty()
  @IsUUID()
  courtId: string;

  @ApiProperty({ example: '2026-10-13' })
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'date must be YYYY-MM-DD' })
  date: string;

  @ApiProperty({ example: '08:30' })
  @Matches(TIME_PATTERN, { message: 'startTime must be HH:mm (24-hour)' })
  startTime: string;

  @ApiProperty({ example: 60 })
  @IsInt()
  @Min(5)
  @Max(480)
  durationMinutes: number;

  @ApiPropertyOptional({
    example: 17.5,
    description: 'The price the user saw. If the real price differs, the booking is rejected with 409.',
  })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  expectedPrice?: number;
}