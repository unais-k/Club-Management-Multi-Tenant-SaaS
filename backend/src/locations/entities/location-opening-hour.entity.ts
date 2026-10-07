import {
  Check,
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  type Relation,
} from 'typeorm';
import { Location } from './location.entity.js';

@Entity('location_opening_hours')
@Index(['clubId', 'locationId', 'dayOfWeek'])
@Check('CHK_opening_day', '"dayOfWeek" BETWEEN 0 AND 6')
@Check('CHK_opening_range', '"startMinute" >= 0 AND "endMinute" <= 1440 AND "endMinute" > "startMinute"')
export class LocationOpeningHour {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  clubId: string;

  @Column({ type: 'uuid' })
  locationId: string;

  @ManyToOne(() => Location, (l) => l.openingHours, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'locationId' })
  location: Relation<Location>;

  // 0 = Sunday ... 6 = Saturday
  @Column({ type: 'smallint' })
  dayOfWeek: number;

  // Minutes from midnight: 06:00 = 360
  @Column({ type: 'smallint' })
  startMinute: number;

  @Column({ type: 'smallint' })
  endMinute: number;
}