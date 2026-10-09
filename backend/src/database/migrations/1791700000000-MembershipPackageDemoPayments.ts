import { MigrationInterface, QueryRunner } from 'typeorm';

/** Add a clearly simulated package checkout and receipt record. */
export class MembershipPackageDemoPayments1791700000000
  implements MigrationInterface
{
  name = 'MembershipPackageDemoPayments1791700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "user_memberships" ADD "paidAt" TIMESTAMPTZ`,
    );
    await queryRunner.query(`
      CREATE TABLE "membership_payments" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "clubId" uuid NOT NULL,
        "userId" uuid NOT NULL,
        "userMembershipId" uuid NOT NULL,
        "amount" numeric(10,2) NOT NULL,
        "status" varchar(20) NOT NULL DEFAULT 'PENDING',
        "method" varchar(20),
        "paidAt" TIMESTAMPTZ,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_membership_payments" PRIMARY KEY ("id"),
        CONSTRAINT "CHK_membership_payment_amount" CHECK ("amount" >= 0),
        CONSTRAINT "CHK_membership_payment_state" CHECK (
          ("status" = 'PENDING' AND "method" IS NULL AND "paidAt" IS NULL)
          OR
          ("status" = 'SIMULATED_PAID' AND "method" = 'DEMO' AND "paidAt" IS NOT NULL)
        ),
        CONSTRAINT "FK_membership_payment_assignment" FOREIGN KEY ("userMembershipId")
          REFERENCES "user_memberships"("id") ON DELETE RESTRICT ON UPDATE NO ACTION,
        CONSTRAINT "FK_membership_payment_user" FOREIGN KEY ("userId")
          REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_membership_payment_assignment" ON "membership_payments" ("userMembershipId")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_membership_payments_member_date" ON "membership_payments" ("clubId", "userId", "createdAt")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX "public"."IDX_membership_payments_member_date"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."UQ_membership_payment_assignment"`,
    );
    await queryRunner.query(`DROP TABLE "membership_payments"`);
    await queryRunner.query(
      `ALTER TABLE "user_memberships" DROP COLUMN "paidAt"`,
    );
  }
}
