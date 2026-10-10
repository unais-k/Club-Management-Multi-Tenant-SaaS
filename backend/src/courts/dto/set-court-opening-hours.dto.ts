/**
 * Validated body for choosing inherited location hours or replacing a court's
 * complete custom weekly schedule.
 */
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsBoolean, IsOptional, ValidateNested } from 'class-validator';
import { OpeningHourDto } from '../../locations/dto/set-opening-hours.dto.js';

export class SetCourtOpeningHoursDto {
  /** True clears custom rows and makes the court follow its location's hours. */
  @ApiProperty({
    example: false,
    description: 'true = follow the location hours (clears custom hours)',
  })
  @IsBoolean()
  useLocationHours: boolean;

  /** Required when useLocationHours is false; unlisted days are closed. */
  @ApiPropertyOptional({
    type: () => [OpeningHourDto],
    description:
      'Required when useLocationHours is false. Days not listed are closed for this court.',
    example: [
      { dayOfWeek: 1, openTime: '06:00', closeTime: '12:00' },
      { dayOfWeek: 1, openTime: '14:00', closeTime: '23:00' },
    ],
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => OpeningHourDto)
  openingHours?: OpeningHourDto[];
}
