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
import { Membership } from './membership.entity.js';

@Entity('membership_prices')
@Index(['membershipId', 'durationMinutes'], { unique: true })
@Index(['clubId', 'membershipId'])
@Check('CHK_membership_price_not_negative', '"price" >= 0')
@Check('CHK_membership_price_duration', '"durationMinutes" > 0')
export class MembershipPrice {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  clubId: string;

  @Column({ type: 'uuid' })
  membershipId: string;

  @ManyToOne(() => Membership, (m) => m.prices, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'membershipId' })
  membership: Relation<Membership>;

  @Column({ type: 'int' })
  durationMinutes: number;

  @Column({ type: 'numeric', precision: 10, scale: 2, transformer: decimalTransformer })
  price: number;
}