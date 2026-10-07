import {
    Column,
    CreateDateColumn,
    DeleteDateColumn,
    Entity,
    Index,
    JoinColumn,
    ManyToOne,
    OneToMany,
    PrimaryGeneratedColumn,
    type Relation,
    UpdateDateColumn,
} from 'typeorm';
import { Tenant } from '../../tenants/entities/tenant.entity.js';
import { LocationOpeningHour } from './location-opening-hour.entity.js';
import { LocationUnavailablePeriod } from './location-unavailable-period.entity.js';

// Name must be unique per club, ignoring soft-deleted rows
@Entity('locations')
@Index(['clubId', 'name'], { unique: true, where: '"deletedAt" IS NULL' })
export class Location {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  clubId: string;

  @ManyToOne(() => Tenant, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'clubId' })
  tenant: Relation<Tenant>;

  @Column({ type: 'varchar', length: 150 })
  name: string;

  @Column({ type: 'varchar', length: 255 })
  address: string;

  @Column({ type: 'text', nullable: true })
  details: string | null;

  // Allowed booking durations in minutes, e.g. [30, 60, 90, 120]
  @Column({ type: 'int', array: true })
  durations: number[];

  @Column({ type: 'boolean', default: true })
  isActive: boolean;

  @OneToMany(() => LocationOpeningHour, (h) => h.location)
  openingHours: Relation<LocationOpeningHour[]>;

  @OneToMany(() => LocationUnavailablePeriod, (p) => p.location)
  unavailablePeriods: Relation<LocationUnavailablePeriod[]>;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @DeleteDateColumn()
  deletedAt: Date | null;
}