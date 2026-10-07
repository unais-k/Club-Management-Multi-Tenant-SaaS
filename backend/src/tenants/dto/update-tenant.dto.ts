import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

// pricingModel and slug are intentionally NOT here: they cannot change after creation
export class UpdateTenantDto {
  @ApiPropertyOptional({ example: 'Downtown Sports Club Ltd' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  name?: string;

  @ApiPropertyOptional({ example: 'Asia/Dubai' })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  timezone?: string;
}