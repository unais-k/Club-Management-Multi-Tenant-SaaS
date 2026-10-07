import { OmitType, PartialType } from '@nestjs/swagger';
import { CreateShiftDto } from './create-shift.dto.js';

// locationId is excluded: a shift cannot move to another location
export class UpdateShiftDto extends PartialType(
  OmitType(CreateShiftDto, ['locationId'] as const),
) {}