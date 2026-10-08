import {
  Check,
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  Index,
  OneToMany,
  PrimaryGeneratedColumn,
  type Relation,
  UpdateDateColumn,
} from 'typeorm';
import { MembershipPrice } from './membership-price.entity.js';

// Plan name must be unique per club (ignoring soft-deleted plans)
@Entity('memberships')
@Index(['clubId', 'name'], { unique: true, where: '"deletedAt" IS NULL' })
@Check('CHK_membership_validity', '"validityDays" > 0')
export class Membership {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  clubId: string;

  @Column({ type: 'varchar', length: 100 })
  name: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  // How long a subscription lasts, e.g. 30
  @Column({ type: 'int' })
  validityDays: number;

  @Column({ type: 'boolean', default: true })
  isActive: boolean;

  @OneToMany(() => MembershipPrice, (p) => p.membership)
  prices: Relation<MembershipPrice[]>;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @DeleteDateColumn()
  deletedAt: Date | null;
}