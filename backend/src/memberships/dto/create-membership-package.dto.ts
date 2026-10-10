/**
 * Validated body defining a membership package option. Total package fee is
 * calculated as pricePerBooking multiplied by includedBookings.
 */
import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsNumber, Max, Min } from 'class-validator';

export class CreateMembershipPackageDto {
  /** Number of calendar days the paid package remains valid. */
  @ApiProperty({ example: 30, description: 'Package validity in days.' })
  @IsInt()
  @Min(1)
  @Max(3650)
  validityDays: number;

  /** Duration, in minutes, of every booking covered by this package. */
  @ApiProperty({ example: 30, description: 'Duration of each included booking.' })
  @IsInt()
  @Min(5)
  @Max(480)
  bookingDurationMinutes: number;

  /** Maximum number of confirmed bookings the package includes. */
  @ApiProperty({ example: 24, description: 'Number of bookings included in this package.' })
  @IsInt()
  @Min(1)
  @Max(10000)
  includedBookings: number;

  /** Numeric fee for each included booking; client displays the currency symbol. */
  @ApiProperty({
    example: 50,
    description: 'Numeric rate per included booking. The package fee is calculated as rate × quota.',
  })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(10000000)
  pricePerBooking: number;
}
