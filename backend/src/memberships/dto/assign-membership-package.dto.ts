/** Validated Club Admin request to assign a package to an existing club consumer. */
import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

export class AssignMembershipPackageDto {
  /** Consumer UUID; service verifies active status, role, and club ownership. */
  @ApiProperty({ description: 'Consumer account registered in this club context.' })
  @IsUUID()
  userId: string;

  /** UUID of the active package selected for this assignment. */
  @ApiProperty({ description: 'Active package option to assign.' })
  @IsUUID()
  packageId: string;
}
