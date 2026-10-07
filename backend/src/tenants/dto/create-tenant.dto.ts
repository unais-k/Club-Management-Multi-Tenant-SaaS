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
  @ApiProperty({ example: 'Downtown Sports Club' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  name: string;

  @ApiProperty({ example: 'downtown-sports' })
  @IsString()
  @MaxLength(100)
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, {
    message: 'slug must be lowercase letters, numbers and single hyphens',
  })
  slug: string;

  @ApiProperty({ enum: PricingModel, example: PricingModel.SHIFT_BASED })
  @IsEnum(PricingModel)
  pricingModel: PricingModel;

  @ApiPropertyOptional({ example: 'Asia/Kolkata' })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  timezone?: string;

  @ApiProperty({ example: 'Club Owner' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  adminName: string;

  @ApiProperty({ example: 'owner@downtown.com' })
  @IsEmail()
  @MaxLength(190)
  adminEmail: string;

  @ApiProperty({ example: 'StrongPass123' })
  @IsString()
  @MinLength(8)
  @MaxLength(72)
  adminPassword: string;
}