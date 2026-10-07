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
import { Court } from './court.entity.js';

@Entity('court_opening_hours')
@Index(['clubId', 'courtId', 'dayOfWeek'])
@Check('CHK_court_hour_day', '"dayOfWeek" BETWEEN 0 AND 6')
@Check(
  'CHK_court_hour_range',
  '"startMinute" >= 0 AND "endMinute" <= 1440 AND "endMinute" > "startMinute"',
)
export class CourtOpeningHour {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  clubId: string;

  @Column({ type: 'uuid' })
  courtId: string;

  @ManyToOne(() => Court, (c) => c.openingHours, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'courtId' })
  court: Relation<Court>;

  @Column({ type: 'smallint' })
  dayOfWeek: number;

  @Column({ type: 'smallint' })
  startMinute: number;

  @Column({ type: 'smallint' })
  endMinute: number;
}