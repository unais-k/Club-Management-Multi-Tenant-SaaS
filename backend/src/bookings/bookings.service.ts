import {
    BadRequestException,
    ConflictException,
    Injectable,
    NotFoundException,
    UnprocessableEntityException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import {
    type BlockReason,
    type DayInput,
    findBlockingReason,
    slotStep,
} from '../availability/availability-engine.js';
import {
    evaluateBookingDate,
    hasStarted,
    isCancellationWindowClosed,
} from '../availability/booking-window.js';
import { BookingStatus, PricingModel, UserRole } from '../common/enums/index.js';
import { dayOfWeekOf, isRealDate, nowInTimezone } from '../common/helpers/date.js';
import { isExclusionViolation } from '../common/helpers/db-errors.js';
import { type MinuteRange, toHHmm, toMinutes } from '../common/helpers/time.js';
import { AuthUser } from '../common/types/auth-user.js';
import { Court } from '../courts/entities/court.entity.js';
import { LocationUnavailablePeriod } from '../locations/entities/location-unavailable-period.entity.js';
import { Location } from '../locations/entities/location.entity.js';
import { PricingService } from '../pricing/pricing.service.js';
import { Tenant } from '../tenants/entities/tenant.entity.js';
import { MembershipPackage } from '../memberships/entities/membership-package.entity.js';
import { UserMembership } from '../memberships/entities/user-membership.entity.js';
import { CreateBookingDto } from './dto/create-booking.dto.js';
import { BookingPeriod, ListBookingsQueryDto } from './dto/list-bookings-query.dto.js';
import { Booking } from './entities/booking.entity.js';

const toRange = (r: { startMinute: number; endMinute: number }): MinuteRange => ({
    start: r.startMinute,
    end: r.endMinute,
});

@Injectable()
export class BookingsService {
    constructor(
        @InjectRepository(Booking) private readonly bookingRepo: Repository<Booking>,
        @InjectRepository(Tenant) private readonly tenantRepo: Repository<Tenant>,
        @InjectRepository(Court) private readonly courtRepo: Repository<Court>,
        @InjectRepository(Location) private readonly locationRepo: Repository<Location>,
        private readonly pricingService: PricingService,
        private readonly dataSource: DataSource,
    ) { }

    // ---------- Create ----------

    async create(clubId: string, user: AuthUser, dto: CreateBookingDto) {
        const tenant = await this.getTenant(clubId);

        // 1. Tenant-checked court and location (inactive ones look like "not found" to consumers)
        const court = await this.courtRepo.findOne({
            where: { id: dto.courtId, clubId },
            relations: { openingHours: true },
        });
        if (!court || !court.isActive) throw new NotFoundException('Court not found');

        const location = await this.locationRepo.findOne({
            where: { id: court.locationId, clubId },
            relations: { openingHours: true },
        });
        if (!location || !location.isActive) throw new NotFoundException('Court not found');

        // 2. Request rules
        const offered = court.durations ?? location.durations;
        if (!offered.includes(dto.durationMinutes)) {
            throw new BadRequestException(
                `Duration ${dto.durationMinutes} is not offered by this court. Offered: ${offered.join(', ')}`,
            );
        }

        const start = toMinutes(dto.startTime);
        const end = start + dto.durationMinutes;
        if (end > 1440) throw new BadRequestException('A booking must end by 24:00');

        const step = slotStep(location.durations);
        if (start % step !== 0) {
            throw new BadRequestException(
                `Start time must be on a ${step}-minute boundary (for example ${toHHmm(Math.ceil(start / step) * step)})`,
            );
        }

        const window = evaluateBookingDate(dto.date, tenant.timezone);
        if (!window.ok) throw new BadRequestException(window.message);
        if (start < window.earliestStart) {
            throw new BadRequestException('This start time has already passed');
        }

        // 3. Price, always calculated on the server
        const pricer = await this.pricingService.createPricer(clubId, user, {
            model: tenant.pricingModel,
            locationId: location.id,
            courtIds: [court.id],
            durationMinutes: dto.durationMinutes,
        });
        const quote = pricer.priceFor(court.id, start);
        if (quote.price === null) {
            throw new UnprocessableEntityException(
                quote.priceNote ?? pricer.note ?? 'No price is available for this booking',
            );
        }
        const price: number = quote.price; // plain const, so it stays a number inside the transaction callback

        if (
            dto.expectedPrice !== undefined &&
            Math.round(dto.expectedPrice * 100) !== Math.round(price * 100)
        ) {
            throw new ConflictException(
                `The price is now ${price}. Please review it and confirm again.`,
            );
        }

        // 4. Lock, re-check with fresh data, insert (all or nothing)
        const weekday = dayOfWeekOf(dto.date);
        try {
            const saved = await this.dataSource.transaction(async (manager) => {
                // Other bookings for THIS court wait here until we commit or roll back
                const locked = await manager.findOne(Court, {
                    where: { id: court.id, clubId },
                    lock: { mode: 'pessimistic_write' },
                });
                if (!locked || !locked.isActive) throw new NotFoundException('Court not found');

                let userMembershipId: string | null = null;
                if (tenant.pricingModel === PricingModel.MEMBERSHIP_BASED) {
                    const assignmentId = pricer.userMembershipId;
                    if (!assignmentId) {
                        throw new ConflictException(
                            'An active membership package with remaining booking credits is required.',
                        );
                    }

                    const assignment = await manager.findOne(UserMembership, {
                        where: { id: assignmentId, clubId, userId: user.id },
                        lock: { mode: 'pessimistic_write' },
                    });
                    const membershipPackage = assignment?.packageId
                        ? await manager.findOne(MembershipPackage, {
                            where: { id: assignment.packageId, clubId },
                        })
                        : null;
                    const now = new Date();
                    if (
                        !assignment ||
                        assignment.cancelledAt ||
                        !assignment.paidAt ||
                        assignment.startsAt > now ||
                        assignment.expiresAt <= now ||
                        !membershipPackage ||
                        membershipPackage.bookingDurationMinutes !== dto.durationMinutes
                    ) {
                        throw new ConflictException(
                            'Your membership package is no longer eligible for this booking. Refresh availability and try again.',
                        );
                    }

                    const usedBookings = await manager.count(Booking, {
                        where: {
                            userMembershipId: assignment.id,
                            status: BookingStatus.CONFIRMED,
                        },
                    });
                    if (usedBookings >= membershipPackage.includedBookings) {
                        throw new ConflictException(
                            'Your membership package has no remaining booking credits.',
                        );
                    }
                    userMembershipId = assignment.id;
                }

                // Read what can conflict only after the lock is held
                const periods = await manager.findBy(LocationUnavailablePeriod, {
                    clubId,
                    locationId: location.id,
                    date: dto.date,
                });
                const existing = await manager.find(Booking, {
                    where: {
                        clubId,
                        courtId: court.id,
                        date: dto.date,
                        status: BookingStatus.CONFIRMED,
                    },
                    select: { id: true, startMinute: true, endMinute: true },
                });

                const input: DayInput = {
                    locationHours: location.openingHours
                        .filter((h) => h.dayOfWeek === weekday)
                        .map(toRange),
                    courtHours: court.useCustomHours
                        ? court.openingHours.filter((h) => h.dayOfWeek === weekday).map(toRange)
                        : null,
                    unavailable: periods.map(toRange),
                    bookings: existing.map(toRange),
                };

                const reason = findBlockingReason(input, start, end);
                if (reason) throw this.blockedError(reason);

                return manager.save(
                    manager.create(Booking, {
                        clubId,
                        locationId: location.id,
                        courtId: court.id,
                        userId: user.id,
                        date: dto.date,
                        startMinute: start,
                        endMinute: end,
                        durationMinutes: dto.durationMinutes,
                        price,
                        pricingModel: tenant.pricingModel,
                        userMembershipId,
                        membershipId: pricer.membership?.id ?? null,
                        membershipName: pricer.membership?.name ?? null,
                        status: BookingStatus.CONFIRMED,
                    }),
                );
            });

            saved.court = court;
            saved.location = location;
            return this.toResponse(saved, tenant.timezone, new Date(), false);
        } catch (err) {
            // The database refused an overlap that slipped past the lock
            if (isExclusionViolation(err)) throw this.blockedError('ALREADY_BOOKED');
            throw err;
        }
    }

    // ---------- Read ----------

    async findAll(clubId: string, user: AuthUser, q: ListBookingsQueryDto) {
        for (const d of [q.dateFrom, q.dateTo]) {
            if (d && !isRealDate(d)) throw new BadRequestException(`"${d}" is not a valid date`);
        }

        const tenant = await this.getTenant(clubId);
        const now = new Date();
        const today = nowInTimezone(tenant.timezone, now);

        const qb = this.bookingRepo
            .createQueryBuilder('b')
            .withDeleted() // keep court/location names for deleted courts and locations
            .leftJoinAndSelect('b.court', 'court')
            .leftJoinAndSelect('b.location', 'location')
            .leftJoinAndSelect('b.user', 'user')
            .where('b.clubId = :clubId', { clubId });

        // Consumers only ever see their own bookings
        if (user.role === UserRole.CONSUMER) qb.andWhere('b.userId = :userId', { userId: user.id });

        if (q.status) qb.andWhere('b.status = :status', { status: q.status });
        if (q.locationId) qb.andWhere('b.locationId = :locationId', { locationId: q.locationId });
        if (q.courtId) qb.andWhere('b.courtId = :courtId', { courtId: q.courtId });
        if (q.dateFrom) qb.andWhere('b.date >= :dateFrom', { dateFrom: q.dateFrom });
        if (q.dateTo) qb.andWhere('b.date <= :dateTo', { dateTo: q.dateTo });

        if (q.period === BookingPeriod.UPCOMING) {
            qb.andWhere('(b.date > :today OR (b.date = :today AND b.endMinute > :minute))', {
                today: today.date,
                minute: today.minute,
            });
        } else if (q.period === BookingPeriod.PAST) {
            qb.andWhere('(b.date < :today OR (b.date = :today AND b.endMinute <= :minute))', {
                today: today.date,
                minute: today.minute,
            });
        }

        // Upcoming: soonest first. Everything else: newest first.
        const direction = q.period === BookingPeriod.UPCOMING ? 'ASC' : 'DESC';
        qb.orderBy('b.date', direction)
            .addOrderBy('b.startMinute', direction)
            .skip((q.page - 1) * q.limit)
            .take(q.limit);

        const [rows, total] = await qb.getManyAndCount();
        const showUser = user.role === UserRole.CLUB_ADMIN;

        return {
            data: rows.map((b) => this.toResponse(b, tenant.timezone, now, showUser)),
            meta: { total, page: q.page, limit: q.limit, totalPages: Math.ceil(total / q.limit) },
        };
    }

    async findOne(clubId: string, user: AuthUser, id: string) {
        const tenant = await this.getTenant(clubId);
        const booking = await this.getVisible(clubId, user, id);
        return this.toResponse(
            booking,
            tenant.timezone,
            new Date(),
            user.role === UserRole.CLUB_ADMIN,
        );
    }

    // ---------- Cancel ----------

    async cancel(clubId: string, user: AuthUser, id: string) {
        const tenant = await this.getTenant(clubId);
        const booking = await this.getVisible(clubId, user, id); // 404 if not ours / not visible

        if (booking.status === BookingStatus.CANCELLED) {
            throw new ConflictException('This booking is already cancelled');
        }
        if (hasStarted(booking.date, booking.startMinute, tenant.timezone)) {
            throw new ConflictException('A booking that has already started cannot be cancelled');
        }
        if (
            isCancellationWindowClosed(
                booking.date,
                booking.startMinute,
                tenant.timezone,
            )
        ) {
            throw new ConflictException(
                'Bookings cannot be cancelled within 30 minutes of their start time',
            );
        }

        // Atomic: only one of two parallel cancels can change the row
        const result = await this.bookingRepo.update(
            { id, clubId, status: BookingStatus.CONFIRMED },
            { status: BookingStatus.CANCELLED, cancelledAt: new Date() },
        );
        if (!result.affected) throw new ConflictException('This booking is already cancelled');

        return this.findOne(clubId, user, id);
    }

    // ---------- Used by courts and locations to protect existing bookings ----------

    async countUpcoming(clubId: string, scope: { courtId?: string; locationId?: string }) {
        const tenant = await this.getTenant(clubId);
        const today = nowInTimezone(tenant.timezone);

        const qb = this.bookingRepo
            .createQueryBuilder('b')
            .where('b.clubId = :clubId', { clubId })
            .andWhere('b.status = :status', { status: BookingStatus.CONFIRMED })
            .andWhere('(b.date > :today OR (b.date = :today AND b.endMinute > :minute))', {
                today: today.date,
                minute: today.minute,
            });

        if (scope.courtId) qb.andWhere('b.courtId = :courtId', { courtId: scope.courtId });
        if (scope.locationId) qb.andWhere('b.locationId = :locationId', { locationId: scope.locationId });

        return qb.getCount();
    }

    async countOverlapping(
        clubId: string,
        locationId: string,
        date: string,
        startMinute: number,
        endMinute: number,
    ) {
        return this.bookingRepo
            .createQueryBuilder('b')
            .where('b.clubId = :clubId', { clubId })
            .andWhere('b.locationId = :locationId', { locationId })
            .andWhere('b.date = :date', { date })
            .andWhere('b.status = :status', { status: BookingStatus.CONFIRMED })
            .andWhere('b.startMinute < :endMinute AND b.endMinute > :startMinute', {
                startMinute,
                endMinute,
            })
            .getCount();
    }

    // ---------- Helpers ----------

    private async getTenant(clubId: string): Promise<Tenant> {
        const tenant = await this.tenantRepo.findOneBy({ id: clubId });
        if (!tenant) throw new NotFoundException('Club not found');
        return tenant;
    }

    // Tenant check: club_id must match; consumers can additionally only see their own
    private async getVisible(clubId: string, user: AuthUser, id: string): Promise<Booking> {
        const booking = await this.bookingRepo.findOne({
            where: {
                id,
                clubId,
                ...(user.role === UserRole.CONSUMER && { userId: user.id }),
            },
            relations: { court: true, location: true, user: true },
            withDeleted: true,
        });
        if (!booking) throw new NotFoundException('Booking not found');
        return booking;
    }

    private blockedError(reason: BlockReason) {
        switch (reason) {
            case 'ALREADY_BOOKED':
                return new ConflictException(
                    'This time slot was just booked by someone else. Please pick another slot.',
                );
            case 'LOCATION_UNAVAILABLE':
                return new UnprocessableEntityException('The location is unavailable at this time');
            case 'OUTSIDE_COURT_HOURS':
                return new UnprocessableEntityException('This court is not open at this time');
            case 'OUTSIDE_LOCATION_HOURS':
                return new UnprocessableEntityException('The location is closed at this time');
        }
    }

    private toResponse(b: Booking, timeZone: string, now: Date, includeUser: boolean) {
        return {
            id: b.id,
            status: b.status,
            date: b.date,
            startTime: toHHmm(b.startMinute),
            endTime: toHHmm(b.endMinute),
            durationMinutes: b.durationMinutes,
            price: b.price,
            pricingModel: b.pricingModel,
            membershipName: b.membershipName,
            court: { id: b.courtId, name: b.court?.name ?? null },
            location: { id: b.locationId, name: b.location?.name ?? null },
            ...(includeUser && {
                user: { id: b.userId, name: b.user?.name ?? null, email: b.user?.email ?? null },
            }),
            canCancel:
                b.status === BookingStatus.CONFIRMED &&
                !hasStarted(b.date, b.startMinute, timeZone, now) &&
                !isCancellationWindowClosed(b.date, b.startMinute, timeZone, now),
            cancelledAt: b.cancelledAt,
            createdAt: b.createdAt,
        };
    }
}
