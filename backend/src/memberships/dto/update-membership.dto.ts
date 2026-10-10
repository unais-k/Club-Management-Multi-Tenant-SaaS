/** Partial membership-plan edit body, including optional active status. */
import { ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { IsBoolean, IsOptional } from 'class-validator';
import { CreateMembershipDto } from './create-membership.dto.js';

export class UpdateMembershipDto extends PartialType(CreateMembershipDto) {
  /** Set false to hide the plan from future consumer use while preserving history. */
  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
