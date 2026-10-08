import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Exclusion,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  type Relation,
} from 'typeorm';
import { BookingStatus, PricingModel } from '../../common/enums/index.js';
import { decimalTransformer } from '../../common/helpers/decimal.transformer.js';
import { Court } from '../../courts/entities/court.entity.js';
import { Location } from '../../locations/entities/location.entity.js';
import { User } from '../../users/entities/user.entity.js';

@Entity('bookings')
@Exclusion(
  'EXCL_bookings_no_overlap',
  `USING gist ("courtId" WITH =, "date" WITH =, int4range("startMinute"::int, "endMinute"::int) WITH &&) WHERE ("status" = 'CONFIRMED')`,
)
// Availability and the overlap check read "confirmed bookings of one court on one date"
@Index(['courtId', 'date'], { where: `"status" = 'CONFIRMED'` })
@Index(['clubId', 'locationId', 'date'])
@Index(['clubId', 'userId', 'date'])
@Check(
  'CHK_booking_range',
  '"startMinute" >= 0 AND "endMinute" <= 1440 AND "endMinute" > "startMinute"',
)
@Check('CHK_booking_duration', '"durationMinutes" = "endMinute" - "startMinute"')
@Check('CHK_booking_price', '"price" >= 0')
export class Booking {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  clubId: string;

  @Column({ type: 'uuid' })
  locationId: string;

  @ManyToOne(() => Location, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'locationId' })
  location: Relation<Location>;

  @Column({ type: 'uuid' })
  courtId: string;

  @ManyToOne(() => Court, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'courtId' })
  court: Relation<Court>;

  @Column({ type: 'uuid' })
  userId: string;

  @ManyToOne(() => User, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'userId' })
  user: Relation<User>;

  // 'YYYY-MM-DD' in the club's timezone
  @Column({ type: 'date' })
  date: string;

  @Column({ type: 'smallint' })
  startMinute: number;

  @Column({ type: 'smallint' })
  endMinute: number;

  @Column({ type: 'int' })
  durationMinutes: number;

  // Snapshot: later price changes never affect existing bookings
  @Column({ type: 'numeric', precision: 10, scale: 2, transformer: decimalTransformer })
  price: number;

  @Column({ type: 'enum', enum: PricingModel })
  pricingModel: PricingModel;

  // Plan used for the price (membership-based clubs), copied as a snapshot
  @Column({ type: 'uuid', nullable: true })
  membershipId: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  membershipName: string | null;

  @Column({ type: 'enum', enum: BookingStatus, default: BookingStatus.CONFIRMED })
  status: BookingStatus;

  @Column({ type: 'timestamptz', nullable: true })
  cancelledAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;
}