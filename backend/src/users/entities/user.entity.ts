import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  type Relation,
  UpdateDateColumn,
} from 'typeorm';
import { UserRole } from '../../common/enums/index.js';
import { Tenant } from '../../tenants/entities/tenant.entity.js';

@Entity('users')
@Index(['clubId', 'email'], { unique: true })
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // NULL for platform admins, set for club admins and consumers
  @Column({ type: 'uuid', nullable: true })
  clubId: string | null;

  @ManyToOne(() => Tenant, (tenant) => tenant.users, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'clubId' })
  tenant: Relation<Tenant> | null;

  @Column({ type: 'varchar', length: 150 })
  name: string;

  @Column({ type: 'varchar', length: 190 })
  email: string;

  @Column({ type: 'varchar', length: 255, select: false })
  passwordHash: string;

  @Column({ type: 'enum', enum: UserRole })
  role: UserRole;

  @Column({ type: 'boolean', default: true })
  isActive: boolean;

  @Column({ type: 'varchar', length: 255, nullable: true, select: false })
  refreshTokenHash: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}