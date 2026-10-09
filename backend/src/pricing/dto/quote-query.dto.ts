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
      'Club Admins may filter package options by membership plan. Consumers always use their assigned active package.',
  })
  @IsOptional()
  @IsUUID()
  membershipId?: string;

  @ApiPropertyOptional({
    description:
      'Club Admin only: select a specific package option to return its price.',
  })
  @IsOptional()
  @IsUUID()
  packageId?: string;

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
