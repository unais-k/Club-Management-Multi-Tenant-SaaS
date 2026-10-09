import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  type Relation,
} from 'typeorm';
import { User } from '../../users/entities/user.entity.js';
import { Membership } from './membership.entity.js';
import { MembershipPackage } from './membership-package.entity.js';
import { decimalTransformer } from '../../common/helpers/decimal.transformer.js';

// One row = one subscription of a consumer to a plan
@Entity('user_memberships')
@Index(['clubId', 'userId'])
@Index(['clubId', 'membershipId'])
@Check('CHK_user_membership_range', '"expiresAt" > "startsAt"')
export class UserMembership {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  clubId: string;

  @Column({ type: 'uuid' })
  userId: string;

  @ManyToOne(() => User, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'userId' })
  user: Relation<User>;

  @Column({ type: 'uuid' })
  membershipId: string;

  @ManyToOne(() => Membership, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'membershipId' })
  membership: Relation<Membership>;

  // Nullable during the staged migration so existing subscriptions remain readable.
  @Column({ type: 'uuid', nullable: true })
  packageId: string | null;

  @ManyToOne(
    () => MembershipPackage,
    (membershipPackage) => membershipPackage.assignments,
    { nullable: true, onDelete: 'RESTRICT' },
  )
  @JoinColumn({ name: 'packageId' })
  package: Relation<MembershipPackage> | null;

  // Snapshot the package charge when this assignment is created.
  @Column({
    type: 'numeric',
    precision: 10,
    scale: 2,
    nullable: true,
    transformer: decimalTransformer,
  })
  packageFee: number | null;

  @Column({ type: 'timestamptz' })
  startsAt: Date;

  @Column({ type: 'timestamptz' })
  expiresAt: Date;

  // Set when the consumer cancels; NULL otherwise
  @Column({ type: 'timestamptz', nullable: true })
  cancelledAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;
}
