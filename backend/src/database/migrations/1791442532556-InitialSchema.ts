import { MigrationInterface, QueryRunner } from "typeorm";

export class InitialSchema1791442532556 implements MigrationInterface {
    name = 'InitialSchema1791442532556'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TYPE "public"."users_role_enum" AS ENUM('PLATFORM_ADMIN', 'CLUB_ADMIN', 'CONSUMER')`);
        await queryRunner.query(`CREATE TABLE "users" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "clubId" uuid, "name" character varying(150) NOT NULL, "email" character varying(190) NOT NULL, "passwordHash" character varying(255) NOT NULL, "role" "public"."users_role_enum" NOT NULL, "isActive" boolean NOT NULL DEFAULT true, "refreshTokenHash" character varying(255), "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_a3ffb1c0c8416b9fc6f907b7433" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_43e58c12f5a6f62f5d1fccff31" ON "users"  ("clubId", "email") `);
        await queryRunner.query(`CREATE TYPE "public"."tenants_pricingmodel_enum" AS ENUM('SHIFT_BASED', 'MEMBERSHIP_BASED')`);
        await queryRunner.query(`CREATE TABLE "tenants" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "name" character varying(150) NOT NULL, "slug" character varying(100) NOT NULL, "pricingModel" "public"."tenants_pricingmodel_enum" NOT NULL, "isActive" boolean NOT NULL DEFAULT true, "timezone" character varying(60) NOT NULL DEFAULT 'Asia/Kolkata', "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_2310ecc5cb8be427097154b18fc" UNIQUE ("slug"), CONSTRAINT "PK_53be67a04681c66b87ee27c9321" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "location_opening_hours" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "clubId" uuid NOT NULL, "locationId" uuid NOT NULL, "dayOfWeek" smallint NOT NULL, "startMinute" smallint NOT NULL, "endMinute" smallint NOT NULL, CONSTRAINT "CHK_opening_range" CHECK ("startMinute" >= 0 AND "endMinute" <= 1440 AND "endMinute" > "startMinute"), CONSTRAINT "CHK_opening_day" CHECK ("dayOfWeek" BETWEEN 0 AND 6), CONSTRAINT "PK_355c68a390119f806a215f225f4" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_847413c7e83034edb1e0cc1510" ON "location_opening_hours"  ("clubId", "locationId", "dayOfWeek") `);
        await queryRunner.query(`CREATE TABLE "location_unavailable_periods" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "clubId" uuid NOT NULL, "locationId" uuid NOT NULL, "date" date NOT NULL, "startMinute" smallint NOT NULL, "endMinute" smallint NOT NULL, "reason" character varying(255), "createdAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "CHK_unavailable_range" CHECK ("startMinute" >= 0 AND "endMinute" <= 1440 AND "endMinute" > "startMinute"), CONSTRAINT "PK_abb4dda32cd24370403a5f99262" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_63f4b601f09787ae032cf040b2" ON "location_unavailable_periods"  ("clubId", "locationId", "date") `);
        await queryRunner.query(`CREATE TABLE "locations" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "clubId" uuid NOT NULL, "name" character varying(150) NOT NULL, "address" character varying(255) NOT NULL, "details" text, "durations" integer array NOT NULL, "isActive" boolean NOT NULL DEFAULT true, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "deletedAt" TIMESTAMP, CONSTRAINT "PK_7cc1c9e3853b94816c094825e74" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_6907c12e9a624f39e22ba7fd0f" ON "locations"  ("clubId", "name") WHERE "deletedAt" IS NULL`);
        await queryRunner.query(`CREATE TABLE "court_opening_hours" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "clubId" uuid NOT NULL, "courtId" uuid NOT NULL, "dayOfWeek" smallint NOT NULL, "startMinute" smallint NOT NULL, "endMinute" smallint NOT NULL, CONSTRAINT "CHK_court_hour_range" CHECK ("startMinute" >= 0 AND "endMinute" <= 1440 AND "endMinute" > "startMinute"), CONSTRAINT "CHK_court_hour_day" CHECK ("dayOfWeek" BETWEEN 0 AND 6), CONSTRAINT "PK_4c1f7f7db19b50ee2e57322be58" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_2ba4a6d517d45bd637a0e97470" ON "court_opening_hours"  ("clubId", "courtId", "dayOfWeek") `);
        await queryRunner.query(`CREATE TABLE "courts" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "clubId" uuid NOT NULL, "locationId" uuid NOT NULL, "name" character varying(150) NOT NULL, "description" text, "durations" integer array, "useCustomHours" boolean NOT NULL DEFAULT false, "isActive" boolean NOT NULL DEFAULT true, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "deletedAt" TIMESTAMP, CONSTRAINT "PK_948a5d356c3083f3237ecbf9897" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_fc5dc5bc88d574005c6bb425dd" ON "courts"  ("clubId", "locationId", "name") WHERE "deletedAt" IS NULL`);
        await queryRunner.query(`CREATE TYPE "public"."bookings_pricingmodel_enum" AS ENUM('SHIFT_BASED', 'MEMBERSHIP_BASED')`);
        await queryRunner.query(`CREATE TYPE "public"."bookings_status_enum" AS ENUM('CONFIRMED', 'CANCELLED')`);
        await queryRunner.query(`CREATE TABLE "bookings" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "clubId" uuid NOT NULL, "locationId" uuid NOT NULL, "courtId" uuid NOT NULL, "userId" uuid NOT NULL, "date" date NOT NULL, "startMinute" smallint NOT NULL, "endMinute" smallint NOT NULL, "durationMinutes" integer NOT NULL, "price" numeric(10,2) NOT NULL, "pricingModel" "public"."bookings_pricingmodel_enum" NOT NULL, "membershipId" uuid, "membershipName" character varying(100), "status" "public"."bookings_status_enum" NOT NULL DEFAULT 'CONFIRMED', "cancelledAt" TIMESTAMP WITH TIME ZONE, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "CHK_booking_price" CHECK ("price" >= 0), CONSTRAINT "CHK_booking_duration" CHECK ("durationMinutes" = "endMinute" - "startMinute"), CONSTRAINT "CHK_booking_range" CHECK ("startMinute" >= 0 AND "endMinute" <= 1440 AND "endMinute" > "startMinute"), CONSTRAINT "EXCL_bookings_no_overlap" EXCLUDE USING gist ("courtId" WITH =, "date" WITH =, int4range("startMinute"::int, "endMinute"::int) WITH &&) WHERE ("status" = 'CONFIRMED'), CONSTRAINT "PK_bee6805982cc1e248e94ce94957" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_f2dc256991f38892b4553ec2f4" ON "bookings"  ("clubId", "userId", "date") `);
        await queryRunner.query(`CREATE INDEX "IDX_2dd27e3f1ace235286a04b9820" ON "bookings"  ("clubId", "locationId", "date") `);
        await queryRunner.query(`CREATE INDEX "IDX_79fdd41a2b6bcd25d8f2f7c227" ON "bookings"  ("courtId", "date") WHERE "status" = 'CONFIRMED'`);
        await queryRunner.query(`CREATE TABLE "memberships" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "clubId" uuid NOT NULL, "name" character varying(100) NOT NULL, "description" text, "validityDays" integer NOT NULL, "isActive" boolean NOT NULL DEFAULT true, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "deletedAt" TIMESTAMP, CONSTRAINT "CHK_membership_validity" CHECK ("validityDays" > 0), CONSTRAINT "PK_25d28bd932097a9e90495ede7b4" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_4aee1e414873a2c7aeacdfe489" ON "memberships"  ("clubId", "name") WHERE "deletedAt" IS NULL`);
        await queryRunner.query(`CREATE TABLE "membership_prices" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "clubId" uuid NOT NULL, "membershipId" uuid NOT NULL, "durationMinutes" integer NOT NULL, "price" numeric(10,2) NOT NULL, CONSTRAINT "CHK_membership_price_duration" CHECK ("durationMinutes" > 0), CONSTRAINT "CHK_membership_price_not_negative" CHECK ("price" >= 0), CONSTRAINT "PK_0037e9c47ec3587fc6ba5f5ddd9" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_3ec4e953761da99e88bcd363f7" ON "membership_prices"  ("clubId", "membershipId") `);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_e428eb294f26c97bee1e0a8479" ON "membership_prices"  ("membershipId", "durationMinutes") `);
        await queryRunner.query(`CREATE TABLE "user_memberships" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "clubId" uuid NOT NULL, "userId" uuid NOT NULL, "membershipId" uuid NOT NULL, "startsAt" TIMESTAMP WITH TIME ZONE NOT NULL, "expiresAt" TIMESTAMP WITH TIME ZONE NOT NULL, "cancelledAt" TIMESTAMP WITH TIME ZONE, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "CHK_user_membership_range" CHECK ("expiresAt" > "startsAt"), CONSTRAINT "PK_5da67bb31a58da5c021ed713860" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_eaec0e54cb62dcc5572c00814a" ON "user_memberships"  ("clubId", "membershipId") `);
        await queryRunner.query(`CREATE INDEX "IDX_d5b33f35469e9d2c83ff70c497" ON "user_memberships"  ("clubId", "userId") `);
        await queryRunner.query(`CREATE TABLE "pricing_shifts" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "clubId" uuid NOT NULL, "locationId" uuid NOT NULL, "name" character varying(100) NOT NULL, "startMinute" smallint NOT NULL, "endMinute" smallint NOT NULL, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "CHK_shift_range" CHECK ("startMinute" >= 0 AND "endMinute" <= 1440 AND "endMinute" > "startMinute"), CONSTRAINT "PK_38bf83a80f071ed2ce71b9c7dbf" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_5d0d0a9595b81d39bcc8242204" ON "pricing_shifts"  ("clubId", "locationId", "name") `);
        await queryRunner.query(`CREATE TABLE "court_prices" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "clubId" uuid NOT NULL, "courtId" uuid NOT NULL, "shiftId" uuid, "durationMinutes" integer NOT NULL, "price" numeric(10,2) NOT NULL, CONSTRAINT "CHK_price_duration" CHECK ("durationMinutes" > 0), CONSTRAINT "CHK_price_not_negative" CHECK ("price" >= 0), CONSTRAINT "PK_fcdcf3c6ffae5e79c65a0fcec80" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_8b7ffafdbb881fba8360d2f9fa" ON "court_prices"  ("courtId", "durationMinutes") WHERE "shiftId" IS NULL`);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_3d609f776c10fd8cd8201c07d8" ON "court_prices"  ("courtId", "durationMinutes", "shiftId") WHERE "shiftId" IS NOT NULL`);
        await queryRunner.query(`CREATE INDEX "IDX_3786b40d2fb22fae80e1b73f29" ON "court_prices"  ("clubId", "courtId") `);
        await queryRunner.query(`ALTER TABLE "users" ADD CONSTRAINT "FK_7c847424bb951725774214c5ac6" FOREIGN KEY ("clubId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "location_opening_hours" ADD CONSTRAINT "FK_fa439751069a18e2a087d3a10a0" FOREIGN KEY ("locationId") REFERENCES "locations"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "location_unavailable_periods" ADD CONSTRAINT "FK_fbf38f8fbf37679aa9889194c93" FOREIGN KEY ("locationId") REFERENCES "locations"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "locations" ADD CONSTRAINT "FK_5d7d50521f548a3a81ce85088c6" FOREIGN KEY ("clubId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "court_opening_hours" ADD CONSTRAINT "FK_0278e09b16c5c56bcddcb4aca16" FOREIGN KEY ("courtId") REFERENCES "courts"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "courts" ADD CONSTRAINT "FK_11f510a5c5ab6cd7197e01b0ef7" FOREIGN KEY ("locationId") REFERENCES "locations"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "bookings" ADD CONSTRAINT "FK_b8cdcf29b7dea8578f7daf2e686" FOREIGN KEY ("locationId") REFERENCES "locations"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "bookings" ADD CONSTRAINT "FK_e8e9a995f2078e6c39793a7f16b" FOREIGN KEY ("courtId") REFERENCES "courts"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "bookings" ADD CONSTRAINT "FK_38a69a58a323647f2e75eb994de" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "membership_prices" ADD CONSTRAINT "FK_b05d0bba0d1026156d50c9a828b" FOREIGN KEY ("membershipId") REFERENCES "memberships"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "user_memberships" ADD CONSTRAINT "FK_53b6d0c12bf234b3a6a003da1cf" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "user_memberships" ADD CONSTRAINT "FK_9482e537622f98734f18f253821" FOREIGN KEY ("membershipId") REFERENCES "memberships"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "pricing_shifts" ADD CONSTRAINT "FK_83fd6de044886e75805b8377bab" FOREIGN KEY ("locationId") REFERENCES "locations"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "court_prices" ADD CONSTRAINT "FK_a82a5c0dee1b7de23eb90afd6f9" FOREIGN KEY ("courtId") REFERENCES "courts"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "court_prices" ADD CONSTRAINT "FK_2f4badb7efeb988f27043fca021" FOREIGN KEY ("shiftId") REFERENCES "pricing_shifts"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "court_prices" DROP CONSTRAINT "FK_2f4badb7efeb988f27043fca021"`);
        await queryRunner.query(`ALTER TABLE "court_prices" DROP CONSTRAINT "FK_a82a5c0dee1b7de23eb90afd6f9"`);
        await queryRunner.query(`ALTER TABLE "pricing_shifts" DROP CONSTRAINT "FK_83fd6de044886e75805b8377bab"`);
        await queryRunner.query(`ALTER TABLE "user_memberships" DROP CONSTRAINT "FK_9482e537622f98734f18f253821"`);
        await queryRunner.query(`ALTER TABLE "user_memberships" DROP CONSTRAINT "FK_53b6d0c12bf234b3a6a003da1cf"`);
        await queryRunner.query(`ALTER TABLE "membership_prices" DROP CONSTRAINT "FK_b05d0bba0d1026156d50c9a828b"`);
        await queryRunner.query(`ALTER TABLE "bookings" DROP CONSTRAINT "FK_38a69a58a323647f2e75eb994de"`);
        await queryRunner.query(`ALTER TABLE "bookings" DROP CONSTRAINT "FK_e8e9a995f2078e6c39793a7f16b"`);
        await queryRunner.query(`ALTER TABLE "bookings" DROP CONSTRAINT "FK_b8cdcf29b7dea8578f7daf2e686"`);
        await queryRunner.query(`ALTER TABLE "courts" DROP CONSTRAINT "FK_11f510a5c5ab6cd7197e01b0ef7"`);
        await queryRunner.query(`ALTER TABLE "court_opening_hours" DROP CONSTRAINT "FK_0278e09b16c5c56bcddcb4aca16"`);
        await queryRunner.query(`ALTER TABLE "locations" DROP CONSTRAINT "FK_5d7d50521f548a3a81ce85088c6"`);
        await queryRunner.query(`ALTER TABLE "location_unavailable_periods" DROP CONSTRAINT "FK_fbf38f8fbf37679aa9889194c93"`);
        await queryRunner.query(`ALTER TABLE "location_opening_hours" DROP CONSTRAINT "FK_fa439751069a18e2a087d3a10a0"`);
        await queryRunner.query(`ALTER TABLE "users" DROP CONSTRAINT "FK_7c847424bb951725774214c5ac6"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_3786b40d2fb22fae80e1b73f29"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_3d609f776c10fd8cd8201c07d8"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_8b7ffafdbb881fba8360d2f9fa"`);
        await queryRunner.query(`DROP TABLE "court_prices"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_5d0d0a9595b81d39bcc8242204"`);
        await queryRunner.query(`DROP TABLE "pricing_shifts"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_d5b33f35469e9d2c83ff70c497"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_eaec0e54cb62dcc5572c00814a"`);
        await queryRunner.query(`DROP TABLE "user_memberships"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_e428eb294f26c97bee1e0a8479"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_3ec4e953761da99e88bcd363f7"`);
        await queryRunner.query(`DROP TABLE "membership_prices"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_4aee1e414873a2c7aeacdfe489"`);
        await queryRunner.query(`DROP TABLE "memberships"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_79fdd41a2b6bcd25d8f2f7c227"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_2dd27e3f1ace235286a04b9820"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_f2dc256991f38892b4553ec2f4"`);
        await queryRunner.query(`DROP TABLE "bookings"`);
        await queryRunner.query(`DROP TYPE "public"."bookings_status_enum"`);
        await queryRunner.query(`DROP TYPE "public"."bookings_pricingmodel_enum"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_fc5dc5bc88d574005c6bb425dd"`);
        await queryRunner.query(`DROP TABLE "courts"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_2ba4a6d517d45bd637a0e97470"`);
        await queryRunner.query(`DROP TABLE "court_opening_hours"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_6907c12e9a624f39e22ba7fd0f"`);
        await queryRunner.query(`DROP TABLE "locations"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_63f4b601f09787ae032cf040b2"`);
        await queryRunner.query(`DROP TABLE "location_unavailable_periods"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_847413c7e83034edb1e0cc1510"`);
        await queryRunner.query(`DROP TABLE "location_opening_hours"`);
        await queryRunner.query(`DROP TABLE "tenants"`);
        await queryRunner.query(`DROP TYPE "public"."tenants_pricingmodel_enum"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_43e58c12f5a6f62f5d1fccff31"`);
        await queryRunner.query(`DROP TABLE "users"`);
        await queryRunner.query(`DROP TYPE "public"."users_role_enum"`);
    }

}
