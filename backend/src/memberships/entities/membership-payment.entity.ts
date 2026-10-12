import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  OneToOne,
  PrimaryGeneratedColumn,
  type Relation,
  UpdateDateColumn,
} from 'typeorm';
import { decimalTransformer } from '../../common/helpers/decimal.transformer.js';
import { UserMembership } from './user-membership.entity.js';

/** Status values for the local payment/receipt flow. */
export type MembershipPaymentStatus = 'PENDING' | 'PAID';

/**
 * TypeORM mapping for the local payment confirmation record and printable receipt attached
 * one-to-one to a consumer's membership-package assignment.
 */
@Entity('membership_payments')
@Index('UQ_membership_payment_assignment', ['userMembershipId'], { unique: true })
@Index('IDX_membership_payments_member_date', ['clubId', 'userId', 'createdAt'])
@Check(
  'CHK_membership_payment_amount',
  '"amount" >= 0',
)
@Check(
  'CHK_membership_payment_state',
  `("status" = 'PENDING' AND "method" IS NULL AND "paidAt" IS NULL) OR ("status" = 'PAID' AND "method" = 'ONLINE' AND "paidAt" IS NOT NULL)`,
)
export class MembershipPayment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  clubId: string;

  @Column({ type: 'uuid' })
  userId: string;

  @Column({ type: 'uuid' })
  userMembershipId: string;

  @OneToOne(() => UserMembership, (assignment) => assignment.payment, {
    onDelete: 'RESTRICT',
  })
  @JoinColumn({ name: 'userMembershipId' })
  userMembership: Relation<UserMembership>;

  @Column({
    type: 'numeric',
    precision: 10,
    scale: 2,
    transformer: decimalTransformer,
  })
  amount: number;

  @Column({ type: 'varchar', length: 20, default: 'PENDING' })
  status: MembershipPaymentStatus;

  @Column({ type: 'varchar', length: 20, nullable: true })
  method: 'ONLINE' | null;

  @Column({ type: 'timestamptz', nullable: true })
  paidAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
