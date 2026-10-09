import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

export class AssignMembershipPackageDto {
  @ApiProperty({ description: 'Consumer account registered in this club context.' })
  @IsUUID()
  userId: string;

  @ApiProperty({ description: 'Active package option to assign.' })
  @IsUUID()
  packageId: string;
}
