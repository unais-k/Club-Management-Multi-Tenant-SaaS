import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class LoginDto {
  @ApiPropertyOptional({
    example: 'downtown-sports',
    description: 'Required for club admins and consumers. Omit for the platform admin.',
  })
  @IsOptional()
  @IsString()
  clubSlug?: string;

  @ApiProperty({ example: 'aisha@example.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'StrongPass123' })
  @IsString()
  @IsNotEmpty()
  password: string;
}