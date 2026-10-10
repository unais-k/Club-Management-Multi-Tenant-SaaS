/**
 * Request shapes for completely replacing a plan's legacy duration-based price list.
 */
import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsInt, IsNumber, Max, Min, ValidateNested } from 'class-validator';

export class MembershipPriceDto {
  /** Session duration in minutes for this price row. */
  @ApiProperty({ example: 60 })
  @IsInt()
  @Min(5)
  @Max(480)
  durationMinutes: number;

  /** Numeric rate for the specified duration. */
  @ApiProperty({ example: 18 })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(1000000)
  price: number;
}

export class SetMembershipPricesDto {
  /** Full replacement list; any existing duration not listed is deleted. */
  @ApiProperty({
    type: () => [MembershipPriceDto],
    description: 'The complete price list of the plan. Anything not listed is removed.',
    example: [
      { durationMinutes: 30, price: 10 },
      { durationMinutes: 60, price: 18 },
      { durationMinutes: 90, price: 25 },
    ],
  })
  @IsArray()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => MembershipPriceDto)
  prices: MembershipPriceDto[];
}
