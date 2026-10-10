import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  type Relation,
  UpdateDateColumn,
} from 'typeorm';
import { decimalTransformer } from '../../common/helpers/decimal.transformer.js';
import { Membership } from './membership.entity.js';
import { UserMembership } from './user-membership.entity.js';

/**
 * TypeORM mapping for one purchasable package option under a membership plan.
 * Its unique active key combines plan, validity, and duration; rate × quota
 * determines the package fee, and assignments preserve the chosen package history.
 */
@Entity('membership_packages')
@Index(
  'UQ_membership_package_option',
  ['membershipId', 'validityDays', 'bookingDurationMinutes'],
  { unique: true, where: '"isActive" = true' },
)
@Index('IDX_membership_packages_club_plan', ['clubId', 'membershipId'])
@Check('CHK_membership_package_validity', '"validityDays" > 0')
@Check('CHK_membership_package_duration', '"bookingDurationMinutes" > 0')
@Check('CHK_membership_package_quota', '"includedBookings" > 0')
@Check('CHK_membership_package_rate', '"pricePerBooking" >= 0')
export class MembershipPackage {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  clubId: string;

  @Column({ type: 'uuid' })
  membershipId: string;

  @ManyToOne(() => Membership, (membership) => membership.packages, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'membershipId' })
  membership: Relation<Membership>;

  @Column({ type: 'int' })
  validityDays: number;

  @Column({ type: 'int' })
  bookingDurationMinutes: number;

  @Column({ type: 'int' })
  includedBookings: number;

  @Column({
    type: 'numeric',
    precision: 10,
    scale: 2,
    transformer: decimalTransformer,
  })
  pricePerBooking: number;

  @Column({ type: 'boolean', default: true })
  isActive: boolean;

  @OneToMany(() => UserMembership, (userMembership) => userMembership.package)
  assignments: Relation<UserMembership[]>;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
