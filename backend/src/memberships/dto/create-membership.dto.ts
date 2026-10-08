import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsNotEmpty, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export class CreateMembershipDto {
  @ApiProperty({ example: 'Premium' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name: string;

  @ApiPropertyOptional({ example: 'Discounted rates on every duration' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @ApiProperty({ example: 30, description: 'How many days a subscription lasts' })
  @IsInt()
  @Min(1)
  @Max(3650)
  validityDays: number;
}