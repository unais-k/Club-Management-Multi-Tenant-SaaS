import { MigrationInterface, QueryRunner } from 'typeorm';

/** Add package quotas and retain amount snapshots for bookings. */
export class MembershipPackages1791528932556 implements MigrationInterface {
  name = 'MembershipPackages1791528932556';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "membership_packages" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "clubId" uuid NOT NULL,
        "membershipId" uuid NOT NULL,
        "validityDays" integer NOT NULL,
        "bookingDurationMinutes" integer NOT NULL,
        "includedBookings" integer NOT NULL,
        "pricePerBooking" numeric(10,2) NOT NULL,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "CHK_membership_package_validity" CHECK ("validityDays" > 0),
        CONSTRAINT "CHK_membership_package_duration" CHECK ("bookingDurationMinutes" > 0),
        CONSTRAINT "CHK_membership_package_quota" CHECK ("includedBookings" > 0),
        CONSTRAINT "CHK_membership_package_rate" CHECK ("pricePerBooking" >= 0),
        CONSTRAINT "PK_membership_packages" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_membership_package_option" ON "membership_packages" ("membershipId", "validityDays", "bookingDurationMinutes")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_membership_packages_club_plan" ON "membership_packages" ("clubId", "membershipId")`,
    );
    await queryRunner.query(
      `ALTER TABLE "membership_packages" ADD CONSTRAINT "FK_membership_packages_membership" FOREIGN KEY ("membershipId") REFERENCES "memberships"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );

    // Nullable package linkage keeps old development rows readable during rollout.
    await queryRunner.query(
      `ALTER TABLE "user_memberships" ADD "packageId" uuid`,
    );
    await queryRunner.query(
      `ALTER TABLE "user_memberships" ADD "packageFee" numeric(10,2)`,
    );
    await queryRunner.query(
      `ALTER TABLE "user_memberships" ADD CONSTRAINT "CHK_user_membership_package_fee" CHECK ("packageFee" IS NULL OR "packageFee" >= 0)`,
    );
    await queryRunner.query(
      `ALTER TABLE "user_memberships" ADD CONSTRAINT "FK_user_memberships_package" FOREIGN KEY ("packageId") REFERENCES "membership_packages"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_user_memberships_package" ON "user_memberships" ("packageId")`,
    );

    await queryRunner.query(
      `ALTER TABLE "bookings" ADD "userMembershipId" uuid`,
    );
    await queryRunner.query(
      `ALTER TABLE "bookings" ADD CONSTRAINT "FK_bookings_user_membership" FOREIGN KEY ("userMembershipId") REFERENCES "user_memberships"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_bookings_user_membership" ON "bookings" ("userMembershipId")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX "public"."IDX_bookings_user_membership"`,
    );
    await queryRunner.query(
      `ALTER TABLE "bookings" DROP CONSTRAINT "FK_bookings_user_membership"`,
    );
    await queryRunner.query(
      `ALTER TABLE "bookings" DROP COLUMN "userMembershipId"`,
    );

    await queryRunner.query(
      `DROP INDEX "public"."IDX_user_memberships_package"`,
    );
    await queryRunner.query(
      `ALTER TABLE "user_memberships" DROP CONSTRAINT "FK_user_memberships_package"`,
    );
    await queryRunner.query(
      `ALTER TABLE "user_memberships" DROP CONSTRAINT "CHK_user_membership_package_fee"`,
    );
    await queryRunner.query(
      `ALTER TABLE "user_memberships" DROP COLUMN "packageFee"`,
    );
    await queryRunner.query(
      `ALTER TABLE "user_memberships" DROP COLUMN "packageId"`,
    );

    await queryRunner.query(
      `ALTER TABLE "membership_packages" DROP CONSTRAINT "FK_membership_packages_membership"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_membership_packages_club_plan"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."UQ_membership_package_option"`,
    );
    await queryRunner.query(`DROP TABLE "membership_packages"`);
  }
}
