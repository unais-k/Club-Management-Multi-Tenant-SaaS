/**
 * Validated body for editing a club's mutable profile fields. Slug and pricing
 * model are intentionally omitted because they are fixed at club creation.
 */
import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

// pricingModel and slug are intentionally NOT here: they cannot change after creation
export class UpdateTenantDto {
  /** Optional new club display name (required to be non-empty when supplied). */
  @ApiPropertyOptional({ example: 'Downtown Sports Club Ltd' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  name?: string;

  /** Optional IANA timezone used for local schedule/date calculations. */
  @ApiPropertyOptional({ example: 'Asia/Dubai' })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  timezone?: string;
}
