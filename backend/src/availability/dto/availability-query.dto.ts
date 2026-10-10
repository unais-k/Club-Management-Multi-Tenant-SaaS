/**
 * Validated query for generating availability for one location/date/duration.
 * Plan/package selectors are optional and intended for Club Admin previews.
 */
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsUUID, Matches, Max, Min } from 'class-validator';

export class AvailabilityQueryDto {
  /** Location UUID to search within the caller's authenticated club. */
  @ApiProperty()
  @IsUUID()
  locationId: string;

  /** Requested club-local date in YYYY-MM-DD form. */
  @ApiProperty({ example: '2026-10-14' })
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'date must be YYYY-MM-DD' })
  date: string;

  /** Booking duration in minutes; it must be offered by the selected location. */
  @ApiProperty({ example: 60 })
  @Type(() => Number)
  @IsInt()
  @Min(5)
  @Max(480)
  durationMinutes: number;

  @ApiPropertyOptional({
    description:
      'Club Admins may filter available package options by plan. Consumers automatically use their assigned active package.',
  })
  @IsOptional()
  @IsUUID()
  /** Optional plan filter for Club Admin package-option previews. */
  membershipId?: string;

  @ApiPropertyOptional({
    description:
      'Club Admin only: select one package option when previewing its specific price.',
  })
  @IsOptional()
  @IsUUID()
  /** Optional exact package price selection for Club Admin preview. */
  packageId?: string;
}
