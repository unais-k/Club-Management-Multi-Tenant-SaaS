/**
 * Validated JSON body for `POST /auth/register`.
 * It contains only consumer account fields; there is deliberately no role field,
 * because public registration always creates a consumer in the selected club.
 */
import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsString, MaxLength, MinLength } from 'class-validator';

export class RegisterDto {
  /** Public club slug used to find the active club that owns this account. */
  @ApiProperty({ example: 'downtown-sports' })
  @IsString()
  @IsNotEmpty()
  clubSlug: string;

  /** Consumer's display name; required and limited to 150 characters. */
  @ApiProperty({ example: 'Aisha Khan' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  name: string;

  /** Consumer's email address; used with clubId as the account identity. */
  @ApiProperty({ example: 'aisha@example.com' })
  @IsEmail()
  @MaxLength(190)
  email: string;

  /** Password submitted once; service hashes it before persistence (8–72 chars). */
  @ApiProperty({ example: 'StrongPass123' })
  @IsString()
  @MinLength(8)
  @MaxLength(72)
  password: string;
}
