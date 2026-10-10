/** Validated request body for adding a named pricing time window to a location. */
import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, IsUUID, Matches, MaxLength } from 'class-validator';
import { TIME_PATTERN } from '../../common/helpers/time.js';

export class CreateShiftDto {
  /** Parent location UUID; service confirms that it belongs to this club. */
  @ApiProperty()
  @IsUUID()
  locationId: string;

  /** Shift label used in admin views and quote segments. */
  @ApiProperty({ example: 'Morning Peak' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name: string;

  /** Inclusive start of the shift in 24-hour HH:mm form. */
  @ApiProperty({ example: '06:00' })
  @Matches(TIME_PATTERN, { message: 'startTime must be HH:mm (24-hour)' })
  startTime: string;

  /** Exclusive end of the shift; 24:00 represents end of the calendar day. */
  @ApiProperty({ example: '09:00', description: '"24:00" means end of day' })
  @Matches(TIME_PATTERN, { message: 'endTime must be HH:mm (24-hour)' })
  endTime: string;
}
