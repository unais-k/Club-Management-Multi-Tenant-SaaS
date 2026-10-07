import {
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn,
  type Relation,
  UpdateDateColumn,
} from 'typeorm';
import { PricingModel } from '../../common/enums/index.js';
import { User } from '../../users/entities/user.entity.js';

@Entity('tenants')
export class Tenant {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 150 })
  name: string;

  // URL-friendly unique name, e.g. "downtown-club"
  @Column({ type: 'varchar', length: 100, unique: true })
  slug: string;

  @Column({ type: 'enum', enum: PricingModel })
  pricingModel: PricingModel;

  @Column({ type: 'boolean', default: true })
  isActive: boolean;

  @Column({ type: 'varchar', length: 60, default: 'Asia/Kolkata' })
  timezone: string;

  @OneToMany(() => User, (user) => user.tenant)
  users: Relation<User[]>;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}