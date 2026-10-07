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
  @ApiProperty({ example: 60 })
  @IsInt()
  @Min(5)
  @Max(480)
  durationMinutes: number;

  @ApiPropertyOptional({
    nullable: true,
    description: 'Shift id. Omit or send null for the Normal (default) price.',
  })
  @IsOptional()
  @IsUUID()
  shiftId?: string | null;

  @ApiProperty({ example: 20 })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(1000000)
  price: number;
}

export class SetCourtPricesDto {
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