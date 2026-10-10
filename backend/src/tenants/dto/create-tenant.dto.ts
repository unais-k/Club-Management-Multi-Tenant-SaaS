/**
 * Validated request body for platform-admin creation of a club and its first
 * club-admin user. The admin password is hashed by the service before storage.
 */
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { PricingModel } from '../../common/enums/index.js';

export class CreateTenantDto {
  /** Club display name (required, maximum 150 characters). */
  @ApiProperty({ example: 'Downtown Sports Club' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  name: string;

  /** Unique URL-safe slug; lowercase letters/numbers separated by single hyphens. */
  @ApiProperty({ example: 'downtown-sports' })
  @IsString()
  @MaxLength(100)
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, {
    message: 'slug must be lowercase letters, numbers and single hyphens',
  })
  slug: string;

  /** Fixed pricing strategy selected when the club is created. */
  @ApiProperty({ enum: PricingModel, example: PricingModel.SHIFT_BASED })
  @IsEnum(PricingModel)
  pricingModel: PricingModel;

  /** Optional IANA timezone used for local dates and booking schedules. */
  @ApiPropertyOptional({ example: 'Asia/Kolkata' })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  timezone?: string;

  /** Name of the club's initial administrator account. */
  @ApiProperty({ example: 'Club Owner' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  adminName: string;

  /** Email of the initial club administrator; normalized before persistence. */
  @ApiProperty({ example: 'owner@downtown.com' })
  @IsEmail()
  @MaxLength(190)
  adminEmail: string;

  /** Initial administrator's plain-text password; service hashes it before saving. */
  @ApiProperty({ example: 'StrongPass123' })
  @IsString()
  @MinLength(8)
  @MaxLength(72)
  adminPassword: string;
}
