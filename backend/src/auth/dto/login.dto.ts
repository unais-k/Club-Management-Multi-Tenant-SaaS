/**
 * Validated JSON body for `POST /auth/login`.
 * Club users provide a club slug to scope lookup to their club; platform admins
 * omit it. The DTO performs shape/format validation before AuthService runs.
 */
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class LoginDto {
  /** Club namespace for club users; omit for platform-admin accounts. */
  @ApiPropertyOptional({
    example: 'downtown-sports',
    description: 'Required for club admins and consumers. Omit for the platform admin.',
  })
  @IsOptional()
  @IsString()
  clubSlug?: string;

  /** Login email; normalized to lowercase by AuthService before lookup. */
  @ApiProperty({ example: 'aisha@example.com' })
  @IsEmail()
  email: string;

  /** Plain-text credential submitted for comparison against the stored hash. */
  @ApiProperty({ example: 'StrongPass123' })
  @IsString()
  @IsNotEmpty()
  password: string;
}
