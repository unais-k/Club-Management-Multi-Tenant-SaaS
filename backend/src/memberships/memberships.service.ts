import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, IsNull, MoreThan, Repository } from 'typeorm';
import { PricingModel, UserRole } from '../common/enums/index.js';
import { isUniqueViolation } from '../common/helpers/db-errors.js';
import { Location } from '../locations/entities/location.entity.js';
import { Tenant } from '../tenants/entities/tenant.entity.js';
import { User } from '../users/entities/user.entity.js';
import { CreateMembershipDto } from './dto/create-membership.dto.js';
import { SetMembershipPricesDto } from './dto/set-membership-prices.dto.js';
import { UpdateMembershipDto } from './dto/update-membership.dto.js';
import { MembershipPrice } from './entities/membership-price.entity.js';
import { Membership } from './entities/membership.entity.js';
import { UserMembership } from './entities/user-membership.entity.js';

const DAY_MS = 24 * 60 * 60 * 1000;

export type MembershipStatus = 'ACTIVE' | 'EXPIRED' | 'CANCELLED';

@Injectable()
export class MembershipsService {
  constructor(
    @InjectRepository(Membership)
    private readonly membershipRepo: Repository<Membership>,
    @InjectRepository(UserMembership)
    private readonly userMembershipRepo: Repository<UserMembership>,
    @InjectRepository(Tenant)
    private readonly tenantRepo: Repository<Tenant>,
    @InjectRepository(Location)
    private readonly locationRepo: Repository<Location>,
    private readonly dataSource: DataSource,
  ) {}

  // ---------- Plans (club admin) ----------

  async create(clubId: string, dto: CreateMembershipDto) {
    await this.assertMembershipBased(clubId);
    const name = dto.name.trim();
    await this.assertNameFree(clubId, name);

    try {
      const plan = await this.membershipRepo.save(
        this.membershipRepo.create({
          clubId,
          name,
          description: dto.description?.trim() || null,
          validityDays: dto.validityDays,
        }),
      );
      plan.prices = [];
      return this.toResponse(plan);
    } catch (err) {
      if (isUniqueViolation(err)) throw this.nameTaken(name);
      throw err;
    }
  }

  async findAll(clubId: string, role: UserRole) {
    // Shift-based clubs have no plans: return an empty list
    if ((await this.getPricingModel(clubId)) !== PricingModel.MEMBERSHIP_BASED) return [];

    const plans = await this.membershipRepo.find({
      where: { clubId },
      relations: { prices: true },
      order: { name: 'ASC' },
    });
    return plans
      .filter((p) => role !== UserRole.CONSUMER || this.isAvailable(p))
      .map((p) => this.toResponse(p));
  }

  async findOne(clubId: string, role: UserRole, id: string) {
    const plan = await this.getOwned(clubId, id);
    if (role === UserRole.CONSUMER && !this.isAvailable(plan)) {
      throw new NotFoundException('Membership not found');
    }
    const response = this.toResponse(plan);
    if (role !== UserRole.CLUB_ADMIN) return response;

    // Help the admin: which durations still have no price?
    const offered = await this.clubDurations(clubId);
    return {
      ...response,
      missingDurations: offered.filter(
        (d) => !plan.prices.some((p) => p.durationMinutes === d),
      ),
    };
  }

  async update(clubId: string, id: string, dto: UpdateMembershipDto) {
    const plan = await this.getOwned(clubId, id);

    if (dto.name !== undefined) {
      const name = dto.name.trim();
      await this.assertNameFree(clubId, name, id);
      plan.name = name;
    }
    if (dto.description !== undefined) plan.description = dto.description.trim() || null;
    if (dto.validityDays !== undefined) plan.validityDays = dto.validityDays; // only affects new subscriptions
    if (dto.isActive !== undefined) plan.isActive = dto.isActive;

    try {
      await this.membershipRepo.save(plan);
    } catch (err) {
      if (isUniqueViolation(err)) throw this.nameTaken(plan.name);
      throw err;
    }
    return this.findOne(clubId, UserRole.CLUB_ADMIN, id);
  }

  async remove(clubId: string, id: string) {
    await this.getOwned(clubId, id); // 404 if it is not ours

    const holders = await this.userMembershipRepo.count({
      where: { clubId, membershipId: id, cancelledAt: IsNull(), expiresAt: MoreThan(new Date()) },
    });
    if (holders > 0) {
      throw new ConflictException(
        `${holders} consumer(s) currently hold this plan. Deactivate it instead: they keep it until it expires.`,
      );
    }
    await this.membershipRepo.softDelete({ id, clubId });
  }

  async setPrices(clubId: string, id: string, dto: SetMembershipPricesDto) {
    await this.assertMembershipBased(clubId);
    const plan = await this.getOwned(clubId, id);

    const offered = await this.clubDurations(clubId);
    if (offered.length === 0) {
      throw new BadRequestException('Create a location with booking durations first');
    }

    const seen = new Set<number>();
    const rows = dto.prices.map((p) => {
      if (!offered.includes(p.durationMinutes)) {
        throw new BadRequestException(
          `Duration ${p.durationMinutes} is not offered by any location. Offered: ${offered.join(', ')}`,
        );
      }
      if (seen.has(p.durationMinutes)) {
        throw new BadRequestException(`Duplicate price for ${p.durationMinutes} minutes`);
      }
      seen.add(p.durationMinutes);
      return { clubId, membershipId: plan.id, durationMinutes: p.durationMinutes, price: p.price };
    });

    // Replace the whole list atomically
    await this.dataSource.transaction(async (manager) => {
      await manager.delete(MembershipPrice, { membershipId: plan.id, clubId });
      if (rows.length > 0) await manager.insert(MembershipPrice, rows);
    });

    return this.findOne(clubId, UserRole.CLUB_ADMIN, id);
  }

  // ---------- Consumer: subscribe, view, cancel ----------

  async subscribe(clubId: string, userId: string, membershipId: string) {
    await this.assertMembershipBased(clubId);
    const plan = await this.getOwned(clubId, membershipId);
    if (!this.isAvailable(plan)) throw new NotFoundException('Membership not found');

    const now = new Date();
    const created = await this.dataSource.transaction(async (manager) => {
      // Lock this user's row: two parallel subscribe calls cannot both pass the check below
      await manager.findOne(User, {
        where: { id: userId },
        lock: { mode: 'pessimistic_write' },
      });

      const existing = await manager.findOne(UserMembership, {
        where: {
          clubId,
          userId,
          membershipId,
          cancelledAt: IsNull(),
          expiresAt: MoreThan(now),
        },
      });
      if (existing) {
        throw new ConflictException(
          `You already have an active "${plan.name}" membership (until ${existing.expiresAt.toISOString()})`,
        );
      }

      return manager.save(
        manager.create(UserMembership, {
          clubId,
          userId,
          membershipId,
          startsAt: now,
          expiresAt: new Date(now.getTime() + plan.validityDays * DAY_MS),
        }),
      );
    });

    return this.toUserMembershipResponse(created, plan, now);
  }

  async myMemberships(clubId: string, userId: string) {
    const now = new Date();
    const rows = await this.userMembershipRepo.find({
      where: { clubId, userId },
      relations: { membership: { prices: true } },
      withDeleted: true, // keep history of plans that were deleted later
      order: { expiresAt: 'DESC' },
    });

    const items = rows.map((r) => this.toUserMembershipResponse(r, r.membership, now));
    const active = items.filter((i) => i.status === 'ACTIVE');

    return {
      current: active[0] ?? null, // the active one that expires last
      active,
      history: items.filter((i) => i.status !== 'ACTIVE').slice(0, 20),
    };
  }

  async cancelMine(clubId: string, userId: string, id: string) {
    const um = await this.userMembershipRepo.findOneBy({ id, clubId, userId });
    if (!um) throw new NotFoundException('Membership not found');

    if (um.cancelledAt || um.expiresAt <= new Date()) {
      throw new ConflictException('This membership has already ended');
    }
    um.cancelledAt = new Date();
    await this.userMembershipRepo.save(um);
  }

  // ---------- Price resolution (used by quotes now and by bookings in Step 10) ----------

  async resolvePrice(
    clubId: string,
    durationMinutes: number,
    opts: { role: UserRole; userId?: string; membershipId?: string },
  ) {
    // A) Price preview for one specific plan
    if (opts.membershipId) {
      const plan = await this.getOwned(clubId, opts.membershipId);
      if (opts.role === UserRole.CONSUMER && !this.isAvailable(plan)) {
        throw new NotFoundException('Membership not found');
      }
      const entry = plan.prices.find((p) => p.durationMinutes === durationMinutes);
      if (!entry) {
        throw new UnprocessableEntityException(
          `The "${plan.name}" plan has no price for ${durationMinutes} minutes`,
        );
      }
      return {
        price: entry.price,
        membership: { id: plan.id, name: plan.name },
        userMembershipId: null as string | null,
      };
    }

    if (!opts.userId) {
      throw new BadRequestException('membershipId is required to preview a membership price');
    }

    // B) The consumer's own active memberships (not cancelled, not expired)
    const active = await this.userMembershipRepo.find({
      where: {
        clubId,
        userId: opts.userId,
        cancelledAt: IsNull(),
        expiresAt: MoreThan(new Date()),
      },
      relations: { membership: { prices: true } },
      withDeleted: true,
    });

    if (active.length === 0) {
      throw new UnprocessableEntityException(
        'An active membership is required. You have no membership, or it has expired.',
      );
    }

    // Only plans that have a price for this duration can be used
    const candidates = active.flatMap((um) => {
      const entry = um.membership.prices.find((p) => p.durationMinutes === durationMinutes);
      return entry ? [{ um, price: entry.price }] : [];
    });
    if (candidates.length === 0) {
      const names = active.map((um) => `"${um.membership.name}"`).join(', ');
      throw new UnprocessableEntityException(
        `Your membership (${names}) has no price for ${durationMinutes} minutes`,
      );
    }

    // Cheapest wins; on a tie, the one that expires later
    candidates.sort(
      (a, b) => a.price - b.price || b.um.expiresAt.getTime() - a.um.expiresAt.getTime(),
    );
    const best = candidates[0];

    return {
      price: best.price,
      membership: { id: best.um.membershipId, name: best.um.membership.name },
      userMembershipId: best.um.id as string | null,
    };
  }

  // ---------- Helpers ----------

  private async getPricingModel(clubId: string): Promise<PricingModel> {
    const tenant = await this.tenantRepo.findOneBy({ id: clubId });
    if (!tenant) throw new NotFoundException('Club not found');
    return tenant.pricingModel;
  }

  private async assertMembershipBased(clubId: string) {
    if ((await this.getPricingModel(clubId)) !== PricingModel.MEMBERSHIP_BASED) {
      throw new ConflictException('This club uses shift-based pricing');
    }
  }

  // Tenant check: the plan must belong to this club
  private async getOwned(clubId: string, id: string): Promise<Membership> {
    const plan = await this.membershipRepo.findOne({
      where: { id, clubId },
      relations: { prices: true },
    });
    if (!plan) throw new NotFoundException('Membership not found');
    return plan;
  }

  // What consumers may see and subscribe to
  private isAvailable(plan: Membership): boolean {
    return plan.isActive && (plan.prices?.length ?? 0) > 0;
  }

  // Every duration offered by at least one location of the club
  private async clubDurations(clubId: string): Promise<number[]> {
    const locations = await this.locationRepo.find({
      where: { clubId },
      select: { id: true, durations: true },
    });
    return [...new Set(locations.flatMap((l) => l.durations))].sort((a, b) => a - b);
  }

  private async assertNameFree(clubId: string, name: string, exceptId?: string) {
    const clash = await this.membershipRepo.findOneBy({ clubId, name });
    if (clash && clash.id !== exceptId) throw this.nameTaken(name);
  }

  private nameTaken(name: string) {
    return new ConflictException(`A membership named "${name}" already exists in this club`);
  }

  private statusOf(um: UserMembership, now: Date): MembershipStatus {
    if (um.cancelledAt) return 'CANCELLED';
    if (um.expiresAt <= now) return 'EXPIRED';
    return 'ACTIVE';
  }

  private sortedPrices(prices?: MembershipPrice[]) {
    return [...(prices ?? [])]
      .sort((a, b) => a.durationMinutes - b.durationMinutes)
      .map((p) => ({ durationMinutes: p.durationMinutes, price: p.price }));
  }

  private toResponse(plan: Membership) {
    return {
      id: plan.id,
      name: plan.name,
      description: plan.description,
      validityDays: plan.validityDays,
      isActive: plan.isActive,
      prices: this.sortedPrices(plan.prices),
      createdAt: plan.createdAt,
      updatedAt: plan.updatedAt,
    };
  }

  private toUserMembershipResponse(
    um: UserMembership,
    plan: Membership | null,
    now: Date,
  ) {
    const status = this.statusOf(um, now);
    return {
      id: um.id,
      status,
      startsAt: um.startsAt,
      expiresAt: um.expiresAt,
      cancelledAt: um.cancelledAt,
      daysLeft:
        status === 'ACTIVE' ? Math.ceil((um.expiresAt.getTime() - now.getTime()) / DAY_MS) : 0,
      membership: plan
        ? {
            id: plan.id,
            name: plan.name,
            description: plan.description,
            validityDays: plan.validityDays,
            prices: this.sortedPrices(plan.prices),
          }
        : null,
    };
  }
}