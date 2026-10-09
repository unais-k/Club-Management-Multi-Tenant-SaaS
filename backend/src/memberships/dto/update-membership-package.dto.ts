import { ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { IsBoolean, IsOptional } from 'class-validator';
import { CreateMembershipPackageDto } from './create-membership-package.dto.js';

export class UpdateMembershipPackageDto extends PartialType(
  CreateMembershipPackageDto,
) {
  @ApiPropertyOptional({
    example: false,
    description: 'Inactive packages cannot be assigned to new consumers.',
  })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
