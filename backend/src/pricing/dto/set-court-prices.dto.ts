/**
 * Request shapes for fully replacing a court's Normal and shift-based duration prices.
 */
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsInt,
  IsNumber,
  IsOptional,
  IsUUID,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

export class CourtPriceDto {
  /** Session duration in minutes that this price covers. */
  @ApiProperty({ example: 60 })
  @IsInt()
  @Min(5)
  @Max(480)
  durationMinutes: number;

  /** Optional shift UUID; null/omitted selects the Normal (default) price. */
  @ApiPropertyOptional({
    nullable: true,
    description: 'Shift id. Omit or send null for the Normal (default) price.',
  })
  @IsOptional()
  @IsUUID()
  shiftId?: string | null;

  /** Numeric price for the duration in the selected shift/Normal period. */
  @ApiProperty({ example: 20 })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(1000000)
  price: number;
}

export class SetCourtPricesDto {
  /** Complete replacement price list; combinations omitted from it are removed. */
  @ApiProperty({
    type: () => [CourtPriceDto],
    description: 'The complete price list for the court. Anything not listed is removed.',
  })
  @IsArray()
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => CourtPriceDto)
  prices: CourtPriceDto[];
}
