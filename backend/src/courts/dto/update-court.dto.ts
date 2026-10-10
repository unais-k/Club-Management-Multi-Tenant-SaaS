/** Partial court-edit body: create-court fields are optional, plus active status. */
import { ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { IsBoolean, IsOptional } from 'class-validator';
import { CreateCourtDto } from './create-court.dto.js';

export class UpdateCourtDto extends PartialType(CreateCourtDto) {
  /** Optional flag controlling whether consumers can book this court. */
  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
