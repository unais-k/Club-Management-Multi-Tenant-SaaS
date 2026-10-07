import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import { TIME_PATTERN } from '../../common/helpers/time.js';

export class CreateUnavailablePeriodDto {
  @ApiProperty({ example: '2026-12-25' })
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'date must be YYYY-MM-DD' })
  date: string;

  @ApiProperty({ example: '10:00' })
  @Matches(TIME_PATTERN, { message: 'startTime must be HH:mm (24-hour)' })
  startTime: string;

  @ApiProperty({ example: '15:00' })
  @Matches(TIME_PATTERN, { message: 'endTime must be HH:mm (24-hour)' })
  endTime: string;

  @ApiPropertyOptional({ example: 'Christmas Event' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  reason?: string;
}