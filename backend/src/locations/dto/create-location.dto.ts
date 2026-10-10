/**
 * Validated request body for creating a location, including the duration options
 * that courts at this location may later inherit or select as a subset.
 */
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
  /** Location display name, unique within this club. */
  @ApiProperty({ example: 'Downtown Sports Center' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  name: string;

  /** Address shown to club users and consumers. */
  @ApiProperty({ example: '12 Main Street, Dubai' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  address: string;

  /** Optional additional location information. */
  @ApiPropertyOptional({ example: 'Indoor courts, free parking' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  details?: string;

  /** Allowed session durations, in minutes, used as the court-duration ceiling. */
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
