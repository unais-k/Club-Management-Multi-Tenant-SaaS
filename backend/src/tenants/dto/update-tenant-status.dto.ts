/** Validated body for changing whether a club is available for use. */
import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean } from 'class-validator';

export class UpdateTenantStatusDto {
  /** `true` activates the club; `false` deactivates it. */
  @ApiProperty({ example: false })
  @IsBoolean()
  isActive: boolean;
}
