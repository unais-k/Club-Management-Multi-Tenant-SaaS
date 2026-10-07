import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayNotEmpty,
  ArrayUnique,
  IsArray,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class CreateCourtDto {
  @ApiProperty({ example: 'Court 1' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  name: string;

  @ApiPropertyOptional({ example: 'Indoor, glass walls' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @ApiPropertyOptional({
    type: [Number],
    nullable: true,
    example: [60, 90],
    description:
      'Optional subset of the location durations. Omit (or send null on update) to offer all of them.',
  })
  @IsOptional() // allows undefined and null
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(10)
  @ArrayUnique()
  @IsInt({ each: true })
  durations?: number[] | null;
}