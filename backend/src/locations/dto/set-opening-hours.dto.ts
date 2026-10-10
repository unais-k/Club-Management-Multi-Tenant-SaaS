/**
 * Input shapes for replacing a location's complete weekly schedule. Time strings
 * are validated here; duration feasibility and overlap checks happen in the service.
 */
import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsInt,
  Matches,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { TIME_PATTERN } from '../../common/helpers/time.js';

export class OpeningHourDto {
  /** Weekday index, 0=Sunday through 6=Saturday. */
  @ApiProperty({ example: 1, description: '0=Sunday ... 6=Saturday' })
  @IsInt()
  @Min(0)
  @Max(6)
  dayOfWeek: number;

  /** Period start time in 24-hour HH:mm form. */
  @ApiProperty({ example: '06:00' })
  @Matches(TIME_PATTERN, { message: 'openTime must be HH:mm (24-hour)' })
  openTime: string;

  /** Period end time; 24:00 is allowed to mean midnight at the end of this day. */
  @ApiProperty({ example: '12:00', description: '"24:00" means midnight at end of day' })
  @Matches(TIME_PATTERN, { message: 'closeTime must be HH:mm (24-hour)' })
  closeTime: string;
}

export class SetOpeningHoursDto {
  /** Full set of open periods; unlisted weekdays become closed. */
  @ApiProperty({
    type: () => [OpeningHourDto],
    description:
      'Complete weekly schedule. Days not listed are closed. Repeat a day for multiple periods.',
    example: [
      { dayOfWeek: 1, openTime: '06:00', closeTime: '12:00' },
      { dayOfWeek: 1, openTime: '14:00', closeTime: '23:00' },
    ],
  })
  @IsArray()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => OpeningHourDto)
  openingHours: OpeningHourDto[];
}
