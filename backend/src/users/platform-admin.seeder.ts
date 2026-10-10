/**
 * Startup seeder for the first platform administrator. Reads credentials from
 * environment configuration, stores a bcrypt hash, and does nothing if a
 * platform-admin account already exists.
 */
import { Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import bcrypt from 'bcryptjs';
import { Repository } from 'typeorm';
import { UserRole } from '../common/enums/index.js';
import { User } from './entities/user.entity.js';

@Injectable()
export class PlatformAdminSeeder implements OnApplicationBootstrap {
  private readonly logger = new Logger(PlatformAdminSeeder.name);

  /**
   * @param userRepo Persists or checks user accounts.
   * @param config Reads PLATFORM_ADMIN_EMAIL and PLATFORM_ADMIN_PASSWORD.
   * @returns No value; Nest injects both dependencies for startup seeding.
   */
  constructor(
    @InjectRepository(User) private readonly userRepo: Repository<User>,
    private readonly config: ConfigService,
  ) {}

  /**
   * Creates the platform-admin account during application startup only when
   * both configured credentials exist and no platform admin is already present.
   * @returns Promise<void>; logs a warning when credentials are absent and
   * otherwise logs after the account is created.
   */
  async onApplicationBootstrap() {
    const email = this.config.get<string>('PLATFORM_ADMIN_EMAIL');
    const password = this.config.get<string>('PLATFORM_ADMIN_PASSWORD');

    if (!email || !password) {
      this.logger.warn('PLATFORM_ADMIN_EMAIL/PASSWORD not set, skipping seed');
      return;
    }
    if (await this.userRepo.existsBy({ role: UserRole.PLATFORM_ADMIN })) return;

    await this.userRepo.save(
      this.userRepo.create({
        clubId: null,
        name: 'Platform Admin',
        email: email.toLowerCase(),
        passwordHash: await bcrypt.hash(password, 10),
        role: UserRole.PLATFORM_ADMIN,
      }),
    );
    this.logger.log(`Platform admin created: ${email}`);
  }
}
