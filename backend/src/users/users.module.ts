import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from './entities/user.entity.js';
import { PlatformAdminSeeder } from './platform-admin.seeder.js';

@Module({
  imports: [TypeOrmModule.forFeature([User])],
  providers: [PlatformAdminSeeder],
  exports: [TypeOrmModule],
})
export class UsersModule {}