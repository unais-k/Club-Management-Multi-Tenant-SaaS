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
import { Location } from './location.entity.js';

@Entity('location_unavailable_periods')
@Index(['clubId', 'locationId', 'date'])
@Check('CHK_unavailable_range', '"startMinute" >= 0 AND "endMinute" <= 1440 AND "endMinute" > "startMinute"')
export class LocationUnavailablePeriod {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  clubId: string;

  @Column({ type: 'uuid' })
  locationId: string;

  @ManyToOne(() => Location, (l) => l.unavailablePeriods, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'locationId' })
  location: Relation<Location>;

  // 'YYYY-MM-DD' (PostgreSQL date, returned as a string)
  @Column({ type: 'date' })
  date: string;

  @Column({ type: 'smallint' })
  startMinute: number;

  @Column({ type: 'smallint' })
  endMinute: number;

  @Column({ type: 'varchar', length: 255, nullable: true })
  reason: string | null;

  @CreateDateColumn()
  createdAt: Date;
}