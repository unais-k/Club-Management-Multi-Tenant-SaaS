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
  @ApiProperty({ example: 1, description: '0=Sunday ... 6=Saturday' })
  @IsInt()
  @Min(0)
  @Max(6)
  dayOfWeek: number;

  @ApiProperty({ example: '06:00' })
  @Matches(TIME_PATTERN, { message: 'openTime must be HH:mm (24-hour)' })
  openTime: string;

  @ApiProperty({ example: '12:00', description: '"24:00" means midnight at end of day' })
  @Matches(TIME_PATTERN, { message: 'closeTime must be HH:mm (24-hour)' })
  closeTime: string;
}

export class SetOpeningHoursDto {
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