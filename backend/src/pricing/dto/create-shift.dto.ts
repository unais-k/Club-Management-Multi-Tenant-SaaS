import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, IsUUID, Matches, MaxLength } from 'class-validator';
import { TIME_PATTERN } from '../../common/helpers/time.js';

export class CreateShiftDto {
  @ApiProperty()
  @IsUUID()
  locationId: string;

  @ApiProperty({ example: 'Morning Peak' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name: string;

  @ApiProperty({ example: '06:00' })
  @Matches(TIME_PATTERN, { message: 'startTime must be HH:mm (24-hour)' })
  startTime: string;

  @ApiProperty({ example: '09:00', description: '"24:00" means end of day' })
  @Matches(TIME_PATTERN, { message: 'endTime must be HH:mm (24-hour)' })
  endTime: string;
}