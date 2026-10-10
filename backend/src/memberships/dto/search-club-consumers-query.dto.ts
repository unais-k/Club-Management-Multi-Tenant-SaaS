/** Optional name/email filter for finding active consumers in the current club. */
import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class SearchClubConsumersQueryDto {
  /** Search text trimmed and applied to both consumer name and email. */
  @ApiPropertyOptional({
    example: 'aisha',
    description: 'Filter this club’s existing consumer accounts by name or email.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(190)
  search?: string;
}
