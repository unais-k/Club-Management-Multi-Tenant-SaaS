import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class SearchClubConsumersQueryDto {
  @ApiPropertyOptional({
    example: 'aisha',
    description: 'Filter this club’s existing consumer accounts by name or email.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(190)
  search?: string;
}
