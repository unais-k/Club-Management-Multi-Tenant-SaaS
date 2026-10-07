import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsString, MaxLength, MinLength } from 'class-validator';

export class RegisterDto {
  @ApiProperty({ example: 'downtown-sports' })
  @IsString()
  @IsNotEmpty()
  clubSlug: string;

  @ApiProperty({ example: 'Aisha Khan' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  name: string;

  @ApiProperty({ example: 'aisha@example.com' })
  @IsEmail()
  @MaxLength(190)
  email: string;

  @ApiProperty({ example: 'StrongPass123' })
  @IsString()
  @MinLength(8)
  @MaxLength(72)
  password: string;
}