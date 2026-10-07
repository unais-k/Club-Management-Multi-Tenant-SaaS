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
import { Location } from '../../locations/entities/location.entity.js';
import { CourtOpeningHour } from './court-opening-hour.entity.js';

// Court name must be unique inside a location (ignoring soft-deleted courts)
@Entity('courts')
@Index(['clubId', 'locationId', 'name'], { unique: true, where: '"deletedAt" IS NULL' })
export class Court {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  clubId: string;

  @Column({ type: 'uuid' })
  locationId: string;

  @ManyToOne(() => Location, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'locationId' })
  location: Relation<Location>;

  @Column({ type: 'varchar', length: 150 })
  name: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  // NULL = offers every duration of the location. Otherwise a subset of them.
  @Column({ type: 'int', array: true, nullable: true })
  durations: number[] | null;

  // false = inherits the location's opening hours; true = uses its own rows
  @Column({ type: 'boolean', default: false })
  useCustomHours: boolean;

  @Column({ type: 'boolean', default: true })
  isActive: boolean;

  @OneToMany(() => CourtOpeningHour, (h) => h.court)
  openingHours: Relation<CourtOpeningHour[]>;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @DeleteDateColumn()
  deletedAt: Date | null;
}