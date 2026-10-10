/** Query parameters for the paginated location list, with optional name search. */
import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto.js';

export class ListLocationsQueryDto extends PaginationQueryDto {
  /** Optional partial location name to search for. */
  @ApiPropertyOptional({ description: 'Search by location name' })
  @IsOptional()
  @IsString()
  search?: string;
}
