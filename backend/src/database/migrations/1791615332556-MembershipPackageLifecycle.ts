import { MigrationInterface, QueryRunner } from 'typeorm';

/** Allow package versions to be retired without changing existing assignments. */
export class MembershipPackageLifecycle1791615332556 implements MigrationInterface {
  name = 'MembershipPackageLifecycle1791615332556';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "membership_packages" ADD "isActive" boolean NOT NULL DEFAULT true`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."UQ_membership_package_option"`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_membership_package_option" ON "membership_packages" ("membershipId", "validityDays", "bookingDurationMinutes") WHERE "isActive" = true`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX "public"."UQ_membership_package_option"`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_membership_package_option" ON "membership_packages" ("membershipId", "validityDays", "bookingDurationMinutes")`,
    );
    await queryRunner.query(
      `ALTER TABLE "membership_packages" DROP COLUMN "isActive"`,
    );
  }
}
