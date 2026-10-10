/**
 * Query parameters for the platform-admin club list. Inherits pagination
 * options and adds an optional partial club-name search.
 */
import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto.js';

export class ListTenantsQueryDto extends PaginationQueryDto {
  /** Optional case-insensitive substring to match against club names. */
  @ApiPropertyOptional({ description: 'Search by club name' })
  @IsOptional()
  @IsString()
  search?: string;
}
