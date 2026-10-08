import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsUUID, Matches, Max, Min } from 'class-validator';

export class AvailabilityQueryDto {
  @ApiProperty()
  @IsUUID()
  locationId: string;

  @ApiProperty({ example: '2026-10-14' })
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'date must be YYYY-MM-DD' })
  date: string;

  @ApiProperty({ example: 60 })
  @Type(() => Number)
  @IsInt()
  @Min(5)
  @Max(480)
  durationMinutes: number;

  @ApiPropertyOptional({
    description:
      'Membership-based clubs only: preview the prices of this plan. Required for admins; consumers default to their own memberships.',
  })
  @IsOptional()
  @IsUUID()
  membershipId?: string;
}