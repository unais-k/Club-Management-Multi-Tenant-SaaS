import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsUUID, Matches, Max, Min } from 'class-validator';
import { TIME_PATTERN } from '../../common/helpers/time.js';

export class QuoteQueryDto {
  @ApiProperty()
  @IsUUID()
  courtId: string;

  @ApiProperty({ example: '08:30' })
  @Matches(TIME_PATTERN, { message: 'startTime must be HH:mm (24-hour)' })
  startTime: string;

  @ApiProperty({ example: 60 })
  @Type(() => Number)
  @IsInt()
  @Min(5)
  @Max(480)
  durationMinutes: number;
}