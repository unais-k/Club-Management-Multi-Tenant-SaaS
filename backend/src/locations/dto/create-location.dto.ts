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
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateLocationDto {
  @ApiProperty({ example: 'Downtown Sports Center' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  name: string;

  @ApiProperty({ example: '12 Main Street, Dubai' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  address: string;

  @ApiPropertyOptional({ example: 'Indoor courts, free parking' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  details?: string;

  @ApiProperty({ type: [Number], example: [30, 60, 90, 120] })
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(10)
  @ArrayUnique()
  @IsInt({ each: true })
  @Min(5, { each: true })
  @Max(480, { each: true })
  durations: number[];
}