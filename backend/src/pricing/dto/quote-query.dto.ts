import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsUUID, Matches, Max, Min } from 'class-validator';
import { TIME_PATTERN } from '../../common/helpers/time.js';

export class QuoteQueryDto {
  @ApiProperty()
  @IsUUID()
  courtId: string;
  
  @ApiPropertyOptional({
    description:
      'Membership-based clubs: preview the price of this plan. Required for admins; consumers default to their own active membership.',
  })
  @IsOptional()
  @IsUUID()
  membershipId?: string;

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