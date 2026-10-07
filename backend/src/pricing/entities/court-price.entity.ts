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
import { decimalTransformer } from '../../common/helpers/decimal.transformer.js';
import { Court } from '../../courts/entities/court.entity.js';
import { PricingShift } from './pricing-shift.entity.js';

@Entity('court_prices')
@Index(['clubId', 'courtId'])
// PostgreSQL treats NULLs as different in unique indexes, so we need two:
// one for shift prices and one for the Normal (shiftId IS NULL) price
@Index(['courtId', 'durationMinutes', 'shiftId'], {
  unique: true,
  where: '"shiftId" IS NOT NULL',
})
@Index(['courtId', 'durationMinutes'], {
  unique: true,
  where: '"shiftId" IS NULL',
})
@Check('CHK_price_not_negative', '"price" >= 0')
@Check('CHK_price_duration', '"durationMinutes" > 0')
export class CourtPrice {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  clubId: string;

  @Column({ type: 'uuid' })
  courtId: string;

  @ManyToOne(() => Court, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'courtId' })
  court: Relation<Court>;

  // NULL = the Normal (default) price
  @Column({ type: 'uuid', nullable: true })
  shiftId: string | null;

  @ManyToOne(() => PricingShift, { onDelete: 'CASCADE', nullable: true })
  @JoinColumn({ name: 'shiftId' })
  shift: Relation<PricingShift> | null;

  @Column({ type: 'int' })
  durationMinutes: number;

  @Column({ type: 'numeric', precision: 10, scale: 2, transformer: decimalTransformer })
  price: number;
}