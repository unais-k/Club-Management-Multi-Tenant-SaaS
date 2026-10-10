/**
 * Validated JSON body for `POST /auth/refresh`.
 * Carries the refresh JWT that AuthService verifies and rotates.
 */
import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class RefreshDto {
  /** Current refresh JWT; success returns a newly issued token pair. */
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  refreshToken: string;
}
