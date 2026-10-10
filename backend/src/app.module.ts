/**
 * Root NestJS module. Loads and validates environment configuration, configures
 * database access and global throttling, and imports the feature modules that
 * make up the API. This is the dependency graph used by main.ts at startup.
 */
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AuthModule } from './auth/auth.module.js';
import { AvailabilityModule } from './availability/availability.module.js';
import { BookingsModule } from './bookings/bookings.module.js';
import { validateEnv } from './config/env.validation.js';
import { CourtsModule } from './courts/courts.module.js';
import { LocationsModule } from './locations/locations.module.js';
import { MembershipsModule } from './memberships/memberships.module.js';
import { PricingModule } from './pricing/pricing.module.js';
import { TenantsModule } from './tenants/tenants.module.js';
import { UsersModule } from './users/users.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validateEnv,
      envFilePath: [
        '.env.local',
        `.env.${process.env.NODE_ENV ?? 'development'}`,
        '.env',
      ],
    }),
    // General limit; login/register/refresh have a stricter one (see AuthController)
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      /**
       * Builds the global in-memory request-throttling configuration.
       * @param config Nest ConfigService, used to honor the test-only
       * THROTTLE_DISABLED setting.
       * @returns A 120-request/60-second default limit, with throttling skipped
       * when THROTTLE_DISABLED is exactly `true`.
       */
      useFactory: (config: ConfigService) => ({
        throttlers: [{ name: 'default', ttl: 60_000, limit: 120 }],
        skipIf: () => config.get('THROTTLE_DISABLED') === 'true',
      }),
    }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      /**
       * Creates the PostgreSQL TypeORM connection options from validated env config.
       * @param config Nest ConfigService containing DB_HOST, DB_PORT,
       * DB_USERNAME, DB_PASSWORD, and DB_NAME.
       * @returns PostgreSQL options that auto-load entities but leave schema
       * changes and migration execution to explicit migration commands.
       */
      useFactory: (config: ConfigService) => ({
        type: 'postgres',
        host: config.get<string>('DB_HOST'),
        port: Number(config.get('DB_PORT')),
        username: config.get<string>('DB_USERNAME'),
        password: config.get<string>('DB_PASSWORD'),
        database: config.get<string>('DB_NAME'),
        autoLoadEntities: true,
        synchronize: false, // the schema is managed by migrations only
        migrationsRun: false,
      }),
    }),
    AuthModule,
    TenantsModule,
    UsersModule,
    LocationsModule,
    CourtsModule,
    PricingModule,
    MembershipsModule,
    AvailabilityModule,
    BookingsModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule { }
