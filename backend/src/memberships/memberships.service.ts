import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  DataSource,
  ILike,
  IsNull,
  LessThanOrEqual,
  MoreThan,
  Not,
  Repository,
} from 'typeorm';
import { BookingStatus, PricingModel, UserRole } from '../common/enums/index.js';
import {
  isForeignKeyViolation,
  isUniqueViolation,
} from '../common/helpers/db-errors.js';
import { Booking } from '../bookings/entities/booking.entity.js';
import { Location } from '../locations/entities/location.entity.js';
import { Tenant } from '../tenants/entities/tenant.entity.js';
import { User } from '../users/entities/user.entity.js';
import { CreateMembershipDto } from './dto/create-membership.dto.js';
import { CreateMembershipPackageDto } from './dto/create-membership-package.dto.js';
import { UpdateMembershipPackageDto } from './dto/update-membership-package.dto.js';
import { AssignMembershipPackageDto } from './dto/assign-membership-package.dto.js';
import { SearchClubConsumersQueryDto } from './dto/search-club-consumers-query.dto.js';
import { SetMembershipPricesDto } from './dto/set-membership-prices.dto.js';
import { UpdateMembershipDto } from './dto/update-membership.dto.js';
import { MembershipPrice } from './entities/membership-price.entity.js';
import { MembershipPackage } from './entities/membership-package.entity.js';
import {
  MembershipPayment,
  type MembershipPaymentStatus,
} from './entities/membership-payment.entity.js';
import { Membership } from './entities/membership.entity.js';
import { UserMembership } from './entities/user-membership.entity.js';

const DAY_MS = 24 * 60 * 60 * 1000;

export type MembershipStatus =
  | 'ACTIVE'
  | 'SCHEDULED'
  | 'PENDING_PAYMENT'
  | 'EXHAUSTED'
  | 'EXPIRED'
  | 'CANCELLED';

@Injectable()
export class MembershipsService {
  constructor(
    @InjectRepository(Membership)
    private readonly membershipRepo: Repository<Membership>,
    @InjectRepository(UserMembership)
    private readonly userMembershipRepo: Repository<UserMembership>,
    @InjectRepository(MembershipPackage)
    private readonly packageRepo: Repository<MembershipPackage>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(Booking)
    private readonly bookingRepo: Repository<Booking>,
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

  // ---------- Packages (club admin) ----------

  async listPackages(clubId: string, membershipId: string) {
    await this.getOwned(clubId, membershipId);
    const packages = await this.packageRepo.find({
      where: { clubId, membershipId },
      order: { validityDays: 'ASC', bookingDurationMinutes: 'ASC' },
    });
    const assignmentCounts = packages.length
      ? await this.userMembershipRepo
          .createQueryBuilder('assignment')
          .select('assignment.packageId', 'packageId')
          .addSelect('COUNT(*)', 'count')
          .where('assignment.clubId = :clubId', { clubId })
          .andWhere('assignment.packageId IN (:...packageIds)', {
            packageIds: packages.map((membershipPackage) => membershipPackage.id),
          })
          .groupBy('assignment.packageId')
          .getRawMany<{ packageId: string; count: string }>()
      : [];
    const countByPackageId = new Map(
      assignmentCounts.map((row) => [row.packageId, Number(row.count)]),
    );
    return packages.map((membershipPackage) => ({
      ...this.toPackageResponse(membershipPackage),
      assignmentCount: countByPackageId.get(membershipPackage.id) ?? 0,
    }));
  }

  async listPackageQuotes(
    clubId: string,
    durationMinutes: number,
    membershipId?: string,
  ) {
    const packages = await this.packageRepo.find({
      where: {
        clubId,
        bookingDurationMinutes: durationMinutes,
        isActive: true,
        ...(membershipId ? { membershipId } : {}),
      },
      relations: { membership: true },
      order: { validityDays: 'ASC', includedBookings: 'ASC' },
    });

    return packages
      .filter((membershipPackage) => membershipPackage.membership?.isActive)
      .map((membershipPackage) => ({
        packageId: membershipPackage.id,
        membershipId: membershipPackage.membershipId,
        membershipName: membershipPackage.membership.name,
        validityDays: membershipPackage.validityDays,
        bookingDurationMinutes: membershipPackage.bookingDurationMinutes,
        includedBookings: membershipPackage.includedBookings,
        price: membershipPackage.pricePerBooking,
        packageFee: this.packageFee(
          membershipPackage.pricePerBooking,
          membershipPackage.includedBookings,
        ),
      }));
  }

  async createPackage(
    clubId: string,
    membershipId: string,
    dto: CreateMembershipPackageDto,
  ) {
    await this.assertMembershipBased(clubId);
    await this.getOwned(clubId, membershipId);
    await this.assertPackageDurationOffered(clubId, dto.bookingDurationMinutes);
    this.packageFee(dto.pricePerBooking, dto.includedBookings);

    try {
      const membershipPackage = await this.packageRepo.save(
        this.packageRepo.create({
          clubId,
          membershipId,
          validityDays: dto.validityDays,
          bookingDurationMinutes: dto.bookingDurationMinutes,
          includedBookings: dto.includedBookings,
          pricePerBooking: dto.pricePerBooking,
        }),
      );
      return this.toPackageResponse(membershipPackage);
    } catch (err) {
      if (isUniqueViolation(err)) {
        throw new ConflictException(
          'An active package already exists for this validity and booking duration. Deactivate it before creating a replacement.',
        );
      }
      throw err;
    }
  }

  async updatePackage(
    clubId: string,
    id: string,
    dto: UpdateMembershipPackageDto,
  ) {
    const membershipPackage = await this.getOwnedPackage(clubId, id);
    const hasTermChanges =
      dto.validityDays !== undefined ||
      dto.bookingDurationMinutes !== undefined ||
      dto.includedBookings !== undefined ||
      dto.pricePerBooking !== undefined;

    if (hasTermChanges) {
      const assignments = await this.userMembershipRepo.count({
        where: { clubId, packageId: id },
      });
      if (assignments > 0) {
        throw new ConflictException(
          'This package has been assigned and cannot be changed. Deactivate it and create a replacement package.',
        );
      }
    }

    const nextDuration =
      dto.bookingDurationMinutes ?? membershipPackage.bookingDurationMinutes;
    await this.assertPackageDurationOffered(clubId, nextDuration);
    const nextQuota = dto.includedBookings ?? membershipPackage.includedBookings;
    const nextRate = dto.pricePerBooking ?? membershipPackage.pricePerBooking;
    this.packageFee(nextRate, nextQuota);

    Object.assign(membershipPackage, dto);
    try {
      return this.toPackageResponse(await this.packageRepo.save(membershipPackage));
    } catch (err) {
      if (isUniqueViolation(err)) {
        throw new ConflictException(
          'An active package already exists for this validity and booking duration.',
        );
      }
      throw err;
    }
  }

  async removePackage(clubId: string, id: string) {
    const membershipPackage = await this.getOwnedPackage(clubId, id);
    const assignments = await this.userMembershipRepo.count({
      where: { clubId, packageId: id },
    });
    if (assignments > 0) {
      throw new ConflictException(
        'This package has been assigned to a consumer and cannot be deleted. Deactivate it to stop new assignments while preserving membership history.',
      );
    }

    try {
      await this.packageRepo.remove(membershipPackage);
    } catch (err) {
      if (isForeignKeyViolation(err)) {
        throw new ConflictException(
          'This package has been assigned to a consumer and cannot be deleted. Deactivate it instead.',
        );
      }
      throw err;
    }
  }

  async searchClubConsumers(
    clubId: string,
    query: SearchClubConsumersQueryDto,
  ) {
    const search = query.search?.trim();
    const where = search
      ? [
        { clubId, role: UserRole.CONSUMER, isActive: true, name: ILike(`%${search}%`) },
        { clubId, role: UserRole.CONSUMER, isActive: true, email: ILike(`%${search}%`) },
      ]
      : { clubId, role: UserRole.CONSUMER, isActive: true };
    const consumers = await this.userRepo.find({
      where,
      select: { id: true, name: true, email: true },
      order: { name: 'ASC' },
      take: 25,
    });
    return consumers.map(({ id, name, email }) => ({ id, name, email }));
  }

  async assignPackage(
    clubId: string,
    membershipId: string,
    dto: AssignMembershipPackageDto,
  ) {
    await this.assertMembershipBased(clubId);
    const plan = await this.getOwned(clubId, membershipId);
    if (!plan.isActive) {
      throw new ConflictException('This membership plan is inactive');
    }

    const membershipPackage = await this.getOwnedPackage(clubId, dto.packageId);
    if (
      membershipPackage.membershipId !== membershipId ||
      !membershipPackage.isActive
    ) {
      throw new BadRequestException(
        'Select an active package that belongs to this membership plan',
      );
    }
    await this.assertPackageDurationOffered(
      clubId,
      membershipPackage.bookingDurationMinutes,
    );
    const packageFee = this.packageFee(
      membershipPackage.pricePerBooking,
      membershipPackage.includedBookings,
    );
    const now = new Date();

    const assignment = await this.dataSource.transaction(async (manager) => {
      const consumer = await manager.findOne(User, {
        where: {
          id: dto.userId,
          clubId,
          role: UserRole.CONSUMER,
          isActive: true,
        },
        lock: { mode: 'pessimistic_write' },
      });
      if (!consumer) throw new NotFoundException('Consumer not found in this club');

      const existing = await manager.find(UserMembership, {
        where: {
          clubId,
          userId: consumer.id,
          cancelledAt: IsNull(),
        },
        order: { startsAt: 'ASC' },
      });
      if (existing.some((row) => !row.paidAt)) {
        throw new ConflictException(
          'This consumer already has a membership package waiting for payment.',
        );
      }
      const inDateRange = existing.filter((row) => row.expiresAt > now);
      const currentRows = inDateRange.filter((row) => row.startsAt <= now);
      const scheduled = inDateRange.filter((row) => row.startsAt > now);

      const current: UserMembership[] = [];
      for (const row of currentRows) {
        const packageOption = row.packageId
          ? await manager.findOne(MembershipPackage, {
              where: { id: row.packageId, clubId },
            })
          : null;
        const usedBookings = await manager.count(Booking, {
          where: {
            userMembershipId: row.id,
            status: BookingStatus.CONFIRMED,
          },
        });
        const exhausted =
          packageOption !== null &&
          usedBookings >= packageOption.includedBookings;
        if (!exhausted) current.push(row);
      }

      if (current.length > 1) {
        throw new ConflictException(
          'This consumer has multiple current memberships. Resolve the existing assignments before adding another.',
        );
      }
      if (scheduled.length > 0) {
        throw new ConflictException(
          'This consumer already has a membership scheduled to start.',
        );
      }

      let startsAt = now;
      if (current.length === 1) {
        const currentMembership = current[0];
        const remainingMs = currentMembership.expiresAt.getTime() - now.getTime();
        if (remainingMs > 5 * DAY_MS) {
          throw new ConflictException(
            `A renewal can be assigned only when 5 or fewer days remain. The current membership expires ${currentMembership.expiresAt.toISOString()}.`,
          );
        }
        startsAt = currentMembership.expiresAt;
      }

      const expiresAt = new Date(
        startsAt.getTime() + membershipPackage.validityDays * DAY_MS,
      );
      const savedAssignment = await manager.save(
        manager.create(UserMembership, {
          clubId,
          userId: consumer.id,
          membershipId: plan.id,
          packageId: membershipPackage.id,
          packageFee,
          startsAt,
          expiresAt,
          paidAt: null,
        }),
      );
      const payment = await manager.save(
        manager.create(MembershipPayment, {
          clubId,
          userId: consumer.id,
          userMembershipId: savedAssignment.id,
          amount: packageFee,
          status: 'PENDING',
          method: null,
          paidAt: null,
        }),
      );
      return { assignment: savedAssignment, payment };
    });

    return this.toUserMembershipResponse(
      assignment.assignment,
      plan,
      now,
      membershipPackage,
      0,
      assignment.payment,
    );
  }

  async confirmDemoPayment(clubId: string, userId: string, assignmentId: string) {
    const { assignment, payment } = await this.dataSource.transaction(
      async (manager) => {
        const assignment = await manager.findOne(UserMembership, {
          where: { id: assignmentId, clubId, userId },
          lock: { mode: 'pessimistic_write' },
        });
        if (!assignment) {
          throw new NotFoundException('Membership assignment not found');
        }
        if (assignment.cancelledAt) {
          throw new ConflictException('This membership assignment was cancelled');
        }

        const payment = await manager.findOne(MembershipPayment, {
          where: { userMembershipId: assignment.id, clubId, userId },
          lock: { mode: 'pessimistic_write' },
        });
        if (!payment) throw new NotFoundException('Membership payment not found');
        if (payment.status === 'SIMULATED_PAID') return { assignment, payment };

        const membershipPackage = assignment.packageId
          ? await manager.findOne(MembershipPackage, {
              where: { id: assignment.packageId, clubId },
            })
          : null;
        if (!membershipPackage) {
          throw new ConflictException('The assigned membership package is unavailable');
        }

        const now = new Date();
        if (assignment.startsAt <= now) {
          assignment.startsAt = now;
          assignment.expiresAt = new Date(
            now.getTime() + membershipPackage.validityDays * DAY_MS,
          );
        }
        assignment.paidAt = now;
        payment.status = 'SIMULATED_PAID';
        payment.method = 'DEMO';
        payment.paidAt = now;

        await manager.save(MembershipPayment, payment);
        await manager.save(UserMembership, assignment);
        return { assignment, payment };
      },
    );

    const loaded = await this.userMembershipRepo.findOne({
      where: { id: assignment.id, clubId, userId },
      relations: { membership: { prices: true }, package: true, payment: true },
      withDeleted: true,
    });
    if (!loaded) throw new NotFoundException('Membership assignment not found');
    const usage = await this.getConfirmedBookingCounts([loaded.id]);
    return {
      membership: this.toUserMembershipResponse(
        loaded,
        loaded.membership,
        new Date(),
        loaded.package,
        usage.get(loaded.id) ?? 0,
        payment,
      ),
      receipt: this.toPaymentResponse(payment),
    };
  }

  async listAssignments(clubId: string, search?: string) {
    const query = this.userMembershipRepo
      .createQueryBuilder('assignment')
      .leftJoinAndSelect('assignment.user', 'consumer')
      .leftJoinAndSelect('assignment.membership', 'membership')
      .leftJoinAndSelect('assignment.package', 'membershipPackage')
      .leftJoinAndSelect('assignment.payment', 'payment')
      .where('assignment.clubId = :clubId', { clubId });

    const term = search?.trim();
    if (term) {
      query.andWhere(
        '(consumer.name ILIKE :term OR consumer.email ILIKE :term)',
        { term: `%${term}%` },
      );
    }

    const rows = await query.getMany();
    const now = new Date();
    const usage = await this.getConfirmedBookingCounts(rows.map((row) => row.id));
    const responses = rows.map((row) =>
      this.toUserMembershipResponse(
        row,
        row.membership,
        now,
        row.package,
        usage.get(row.id) ?? 0,
        row.payment,
      ),
    );
    const rank = (status: MembershipStatus) =>
      status === 'ACTIVE'
        ? 0
        : status === 'PENDING_PAYMENT'
          ? 1
          : status === 'SCHEDULED'
            ? 2
            : 3;
    responses.sort(
      (a, b) =>
        rank(a.status) - rank(b.status) ||
        new Date(a.expiresAt).getTime() - new Date(b.expiresAt).getTime(),
    );
    return responses;
  }

  // ---------- Consumer membership view ----------

  async myMemberships(clubId: string, userId: string) {
    const now = new Date();
    const rows = await this.userMembershipRepo.find({
      where: { clubId, userId },
      relations: { membership: { prices: true }, package: true, payment: true },
      withDeleted: true, // keep history of plans that were deleted later
      order: { expiresAt: 'DESC' },
    });

    const usage = await this.getConfirmedBookingCounts(rows.map((row) => row.id));
    const items = rows.map((r) =>
      this.toUserMembershipResponse(
        r,
        r.membership,
        now,
        r.package,
        usage.get(r.id) ?? 0,
        r.payment,
      ),
    );
    const current = items.find((item) => item.status === 'ACTIVE') ?? null;

    return {
      current,
      scheduled: items.filter((item) => item.status === 'SCHEDULED'),
      pendingPayment: items.filter((item) => item.status === 'PENDING_PAYMENT'),
      history: items
        .filter((item) =>
          item.status === 'EXPIRED' ||
          item.status === 'CANCELLED' ||
          item.status === 'EXHAUSTED',
        )
        .slice(0, 20),
    };
  }

  // ---------- Price resolution (used by quotes now and by bookings in Step 10) ----------

  async resolvePrice(
    clubId: string,
    durationMinutes: number,
    opts: {
      role: UserRole;
      userId?: string;
      membershipId?: string;
      packageId?: string;
    },
  ) {
    // Consumers always use their assigned package; they cannot choose a plan or package.
    if (
      opts.role === UserRole.CONSUMER &&
      (opts.membershipId || opts.packageId)
    ) {
      throw new BadRequestException(
        'Consumers use the package assigned to their account and cannot select a membership or package',
      );
    }

    // Admins select a concrete package because duration alone can have several rates.
    if (opts.role === UserRole.CLUB_ADMIN) {
      if (!opts.packageId) {
        throw new UnprocessableEntityException(
          'Select a membership package to preview its price',
        );
      }
      const membershipPackage = await this.getOwnedPackage(clubId, opts.packageId);
      const plan = membershipPackage.membership;
      if (
        !membershipPackage.isActive ||
        !plan?.isActive ||
        membershipPackage.bookingDurationMinutes !== durationMinutes ||
        (opts.membershipId && opts.membershipId !== membershipPackage.membershipId)
      ) {
        throw new UnprocessableEntityException(
          'The selected package is inactive or does not match this duration and membership',
        );
      }
      return {
        price: membershipPackage.pricePerBooking,
        membership: { id: plan.id, name: plan.name },
        package: this.toPackageResponse(membershipPackage),
        userMembershipId: null,
        bookingsRemaining: null,
      };
    }

    if (!opts.userId) {
      throw new BadRequestException('membershipId is required to preview a membership price');
    }

    // B) The consumer's own active package assignments, limited to packages that still have credits
    const now = new Date();
    const active = await this.userMembershipRepo.find({
      where: {
        clubId,
        userId: opts.userId,
        startsAt: LessThanOrEqual(now),
        cancelledAt: IsNull(),
        expiresAt: MoreThan(now),
        paidAt: Not(IsNull()),
      },
      relations: { membership: { prices: true }, package: true },
      withDeleted: true,
    });

    if (active.length === 0) {
      throw new UnprocessableEntityException(
        'An active membership is required. You have no membership, or it has expired.',
      );
    }

    const matchingDuration = active.filter(
      (assignment) =>
        assignment.package?.bookingDurationMinutes === durationMinutes,
    );
    if (matchingDuration.length === 0) {
      throw new UnprocessableEntityException(
        `Your assigned membership package does not include ${durationMinutes}-minute bookings.`,
      );
    }

    const usage = await this.getConfirmedBookingCounts(
      matchingDuration.map((assignment) => assignment.id),
    );
    const candidates = matchingDuration.filter(
      (assignment) =>
        assignment.package &&
        (usage.get(assignment.id) ?? 0) < assignment.package.includedBookings,
    );
    if (candidates.length === 0) {
      throw new UnprocessableEntityException(
        'Your membership package has no remaining booking credits.',
      );
    }

    if (candidates.length > 1) {
      throw new ConflictException(
        'More than one active membership package can cover this booking. Contact the Club Admin to resolve the assignments.',
      );
    }
    const best = candidates[0];

    return {
      price: best.package!.pricePerBooking,
      membership: { id: best.membershipId, name: best.membership.name },
      package: this.toPackageResponse(best.package!),
      userMembershipId: best.id,
      bookingsRemaining:
        best.package!.includedBookings - (usage.get(best.id) ?? 0),
    };
  }

  private async getConfirmedBookingCounts(ids: string[]) {
    const counts = new Map<string, number>();
    if (ids.length === 0) return counts;

    const rows = await this.bookingRepo
      .createQueryBuilder('booking')
      .select('booking.userMembershipId', 'userMembershipId')
      .addSelect('COUNT(booking.id)', 'usedBookings')
      .where('booking.userMembershipId IN (:...ids)', { ids })
      .andWhere('booking.status = :status', { status: BookingStatus.CONFIRMED })
      .groupBy('booking.userMembershipId')
      .getRawMany<{ userMembershipId: string; usedBookings: string }>();

    for (const row of rows) counts.set(row.userMembershipId, Number(row.usedBookings));
    return counts;
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

  private async getOwnedPackage(
    clubId: string,
    id: string,
  ): Promise<MembershipPackage> {
    const membershipPackage = await this.packageRepo.findOne({
      where: { id, clubId },
      relations: { membership: true },
    });
    if (!membershipPackage) throw new NotFoundException('Membership package not found');
    return membershipPackage;
  }

  private async assertPackageDurationOffered(
    clubId: string,
    durationMinutes: number,
  ) {
    const offered = await this.clubDurations(clubId);
    if (offered.length === 0) {
      throw new BadRequestException('Create a location with booking durations first');
    }
    if (!offered.includes(durationMinutes)) {
      throw new BadRequestException(
        `Duration ${durationMinutes} minutes is not offered by any location. Offered: ${offered.join(', ')} minutes.`,
      );
    }
  }

  private packageFee(pricePerBooking: number, includedBookings: number): number {
    const total = Math.round(pricePerBooking * includedBookings * 100) / 100;
    if (!Number.isFinite(total) || total > 99_999_999.99) {
      throw new BadRequestException('The calculated package fee is too large');
    }
    return total;
  }

  private toPackageResponse(membershipPackage: MembershipPackage) {
    return {
      id: membershipPackage.id,
      membershipId: membershipPackage.membershipId,
      validityDays: membershipPackage.validityDays,
      bookingDurationMinutes: membershipPackage.bookingDurationMinutes,
      includedBookings: membershipPackage.includedBookings,
      pricePerBooking: membershipPackage.pricePerBooking,
      packageFee: this.packageFee(
        membershipPackage.pricePerBooking,
        membershipPackage.includedBookings,
      ),
      isActive: membershipPackage.isActive,
      createdAt: membershipPackage.createdAt,
      updatedAt: membershipPackage.updatedAt,
    };
  }

  // Legacy price-preview visibility; package assignment is Club Admin controlled.
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

  private statusOf(
    um: UserMembership,
    now: Date,
    usedBookings = 0,
  ): MembershipStatus {
    if (um.cancelledAt) return 'CANCELLED';
    if (!um.paidAt) return 'PENDING_PAYMENT';
    if (um.expiresAt <= now) return 'EXPIRED';
    if (um.startsAt > now) return 'SCHEDULED';
    if (um.package && usedBookings >= um.package.includedBookings) return 'EXHAUSTED';
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
    membershipPackage: MembershipPackage | null = um.package,
    usedBookings = 0,
    payment: MembershipPayment | null = um.payment,
  ) {
    const status = this.statusOf(um, now, usedBookings);
    return {
      id: um.id,
      userId: um.userId,
      status,
      startsAt: um.startsAt,
      expiresAt: um.expiresAt,
      cancelledAt: um.cancelledAt,
      daysLeft:
        status === 'ACTIVE'
          ? Math.ceil((um.expiresAt.getTime() - now.getTime()) / DAY_MS)
          : 0,
      packageFee: um.packageFee,
      package: membershipPackage
        ? this.toPackageResponse(membershipPackage)
        : null,
      bookingsUsed: membershipPackage ? usedBookings : null,
      bookingsRemaining: membershipPackage
        ? Math.max(membershipPackage.includedBookings - usedBookings, 0)
        : null,
      payment: payment ? this.toPaymentResponse(payment) : null,
      consumer: um.user
        ? { id: um.user.id, name: um.user.name, email: um.user.email }
        : null,
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

  private toPaymentResponse(payment: MembershipPayment) {
    return {
      id: payment.id,
      receiptNumber: `MEM-${payment.id.toUpperCase()}`,
      amount: payment.amount,
      status: payment.status as MembershipPaymentStatus,
      method: payment.method,
      paidAt: payment.paidAt,
      simulated: payment.status === 'SIMULATED_PAID',
    };
  }
}
