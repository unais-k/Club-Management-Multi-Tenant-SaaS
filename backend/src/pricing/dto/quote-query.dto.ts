/**
 * Validated query for requesting a booking-price quote. Membership/package
 * selectors are used by Club Admin previews; consumers use their assignment.
 */
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsUUID, Matches, Max, Min } from 'class-validator';
import { TIME_PATTERN } from '../../common/helpers/time.js';

export class QuoteQueryDto {
  /** Court UUID whose configured pricing is used for the quote. */
  @ApiProperty()
  @IsUUID()
  courtId: string;
  
  @ApiPropertyOptional({
    description:
      'Club Admins may filter package options by membership plan. Consumers always use their assigned active package.',
  })
  @IsOptional()
  @IsUUID()
  /** Optional plan filter for Club Admin package-option previews. */
  membershipId?: string;

  @ApiPropertyOptional({
    description:
      'Club Admin only: select a specific package option to return its price.',
  })
  @IsOptional()
  @IsUUID()
  /** Optional exact package selection, available to Club Admin previews. */
  packageId?: string;

  /** Requested local start time in 24-hour HH:mm form. */
  @ApiProperty({ example: '08:30' })
  @Matches(TIME_PATTERN, { message: 'startTime must be HH:mm (24-hour)' })
  startTime: string;

  /** Booking length in minutes; must be offered by the selected court. */
  @ApiProperty({ example: 60 })
  @Type(() => Number)
  @IsInt()
  @Min(5)
  @Max(480)
  durationMinutes: number;
}
