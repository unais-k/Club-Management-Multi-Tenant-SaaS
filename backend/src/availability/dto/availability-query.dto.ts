import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsUUID, Matches, Max, Min } from 'class-validator';

export class AvailabilityQueryDto {
  @ApiProperty()
  @IsUUID()
  locationId: string;

  @ApiProperty({ example: '2026-10-14' })
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'date must be YYYY-MM-DD' })
  date: string;

  @ApiProperty({ example: 60 })
  @Type(() => Number)
  @IsInt()
  @Min(5)
  @Max(480)
  durationMinutes: number;

  @ApiPropertyOptional({
    description:
      'Club Admins may filter available package options by plan. Consumers automatically use their assigned active package.',
  })
  @IsOptional()
  @IsUUID()
  membershipId?: string;

  @ApiPropertyOptional({
    description:
      'Club Admin only: select one package option when previewing its specific price.',
  })
  @IsOptional()
  @IsUUID()
  packageId?: string;
}
