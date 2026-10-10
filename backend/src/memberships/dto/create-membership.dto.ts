/** Validated body for creating a named membership plan in a club. */
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsNotEmpty, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export class CreateMembershipDto {
  /** Club-visible plan name, unique within the club. */
  @ApiProperty({ example: 'Premium' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name: string;

  /** Optional description shown to club users. */
  @ApiPropertyOptional({ example: 'Discounted rates on every duration' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  /** Default duration for legacy plan subscription data; packages define their own validity. */
  @ApiProperty({ example: 30, description: 'How many days a subscription lasts' })
  @IsInt()
  @Min(1)
  @Max(3650)
  validityDays: number;
}
