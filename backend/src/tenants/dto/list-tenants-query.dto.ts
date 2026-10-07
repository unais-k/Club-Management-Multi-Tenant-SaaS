import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto.js';

export class ListTenantsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: 'Search by club name' })
  @IsOptional()
  @IsString()
  search?: string;
}