/**
 * Tenant business logic for platform-admin operations. Besides basic club CRUD,
 * it creates the first club admin transactionally and assembles the club's
 * schedule/pricing operations view from related location, court, and price data.
 */
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import bcrypt from 'bcryptjs';
import { Between, DataSource, ILike, In, QueryFailedError, Repository } from 'typeorm';
import { Court } from '../courts/entities/court.entity.js';
import { toHHmm } from '../common/helpers/time.js';
import { LocationUnavailablePeriod } from '../locations/entities/location-unavailable-period.entity.js';
import { Location } from '../locations/entities/location.entity.js';
import { CourtPrice } from '../pricing/entities/court-price.entity.js';
import { PricingShift } from '../pricing/entities/pricing-shift.entity.js';
import { PricingModel, UserRole } from '../common/enums/index.js';
import { Membership } from '../memberships/entities/membership.entity.js';
import { User } from '../users/entities/user.entity.js';
import { CreateTenantDto } from './dto/create-tenant.dto.js';
import { ListTenantsQueryDto } from './dto/list-tenants-query.dto.js';
import { UpdateTenantDto } from './dto/update-tenant.dto.js';
import { Tenant } from './entities/tenant.entity.js';

@Injectable()
export class TenantsService {
  /**
   * @param tenantRepo Reads and writes club records.
   * @param locationRepo Reads locations and their weekly opening-hour relations.
   * @param unavailableRepo Reads date-specific location closures.
   * @param courtRepo Reads courts and court-specific weekly hours.
   * @param shiftRepo Reads pricing shifts configured for club locations.
   * @param priceRepo Reads per-court pricing rows.
   * @param membershipRepo Reads membership plans and their duration prices.
   * @param dataSource Opens a database transaction for atomic club/admin creation.
   * @returns No value; Nest injects these dependencies into this service.
   */
  constructor(
    @InjectRepository(Tenant)
    private readonly tenantRepo: Repository<Tenant>,
    @InjectRepository(Location)
    private readonly locationRepo: Repository<Location>,
    @InjectRepository(LocationUnavailablePeriod)
    private readonly unavailableRepo: Repository<LocationUnavailablePeriod>,
    @InjectRepository(Court)
    private readonly courtRepo: Repository<Court>,
    @InjectRepository(PricingShift)
    private readonly shiftRepo: Repository<PricingShift>,
    @InjectRepository(CourtPrice)
    private readonly priceRepo: Repository<CourtPrice>,
    @InjectRepository(Membership)
    private readonly membershipRepo: Repository<Membership>,
    private readonly dataSource: DataSource,
  ) {}

  /**
   * Creates a club and its first club-admin user as one database transaction.
   * The admin password is bcrypt-hashed, email is normalized, and role is fixed
   * to CLUB_ADMIN. A database uniqueness conflict on the slug becomes HTTP 409.
   * @param dto Validated club identity, pricing model, optional timezone, and
   * first-admin name/email/password from the platform-admin request.
   * @returns Promise of the created Tenant entity; the admin account is persisted
   * in the same transaction but is not included in this return value.
   */
  async create(dto: CreateTenantDto): Promise<Tenant> {
    this.assertValidTimezone(dto.timezone);

    if ((await this.tenantRepo.countBy({ slug: dto.slug })) > 0) {
      throw new ConflictException(`Slug "${dto.slug}" is already taken`);
    }

    const passwordHash = await bcrypt.hash(dto.adminPassword, 10);

    try {
      // Transaction: both rows are saved, or neither is
      return await this.dataSource.transaction(async (manager) => {
        // @param manager Transaction-scoped repository; it keeps tenant/admin writes atomic.
        // @returns Saved Tenant entity, e.g. { id, name, slug, pricingModel, isActive, timezone }.
        const tenant = await manager.save(
          manager.create(Tenant, {
            name: dto.name,
            slug: dto.slug,
            pricingModel: dto.pricingModel,
            ...(dto.timezone && { timezone: dto.timezone }),
          }),
        );

        await manager.save(
          manager.create(User, {
            clubId: tenant.id,
            name: dto.adminName,
            email: dto.adminEmail.toLowerCase(),
            passwordHash,
            role: UserRole.CLUB_ADMIN,
          }),
        );

        return tenant;
      });
    } catch (err) {
      // Two requests with the same slug at the same moment: DB unique index wins
      if (
        err instanceof QueryFailedError &&
        (err.driverError as { code?: string })?.code === '23505'
      ) {
        throw new ConflictException(`Slug "${dto.slug}" is already taken`);
      }
      throw err;
    }
  }

  /**
   * Searches clubs by partial name and applies pagination in the database.
   * @param query Validated page (1-based), limit (1–100), and optional search text.
   * @returns Promise of `{ data, meta }`; meta contains matching total, current
   * page, page size, and calculated page count.
   */
  async findAll(query: ListTenantsQueryDto) {
    const { page, limit, search } = query;

    const [data, total] = await this.tenantRepo.findAndCount({
      where: search ? { name: ILike(`%${search}%`) } : {},
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });

    return {
      data,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  /**
   * Fetches one club record by primary key.
   * @param id Club UUID to look up.
   * @returns Promise of the Tenant entity, or throws HTTP 404 when absent.
   */
  async findOne(id: string): Promise<Tenant> {
    const tenant = await this.tenantRepo.findOneBy({ id });
    if (!tenant) throw new NotFoundException('Tenant not found');
    return tenant;
  }

  /**
   * Builds the platform-admin operations view for a club using its local date.
   * It gathers the next seven days of closures and the club's locations, courts,
   * opening hours, shifts, court prices, and membership duration prices.
   * @param id Club UUID whose operational data should be summarized.
   * @returns Promise of a JSON-ready object with tenant summary, membershipPlans,
   * dateRange, nested locations/courts/prices, and upcomingUnavailablePeriods.
   */
  async getOperations(id: string) {
    const tenant = await this.findOne(id);
    const today = this.dateInTimezone(tenant.timezone);
    const throughDate = new Date(`${today}T00:00:00.000Z`);
    throughDate.setUTCDate(throughDate.getUTCDate() + 6);
    const through = throughDate.toISOString().slice(0, 10);
    const dayOfWeek = new Date(`${today}T12:00:00.000Z`).getUTCDay();

    const locations = await this.locationRepo.find({
      where: { clubId: tenant.id },
      relations: { openingHours: true },
      order: { name: 'ASC' },
    });
    const locationIds = locations.map((location) => location.id);
    const [courts, unavailablePeriods, shifts] = locationIds.length
      ? await Promise.all([
          this.courtRepo.find({
            where: { clubId: tenant.id, locationId: In(locationIds) },
            relations: { openingHours: true },
            order: { name: 'ASC' },
          }),
          this.unavailableRepo.find({
            where: { clubId: tenant.id, date: Between(today, through) },
            order: { date: 'ASC', startMinute: 'ASC' },
          }),
          this.shiftRepo.find({
            where: { clubId: tenant.id, locationId: In(locationIds) },
            order: { startMinute: 'ASC' },
          }),
        ])
      : [[], [], []];

    const courtIds = courts.map((court) => court.id);
    const prices = courtIds.length
      ? await this.priceRepo.find({
          where: { clubId: tenant.id, courtId: In(courtIds) },
          order: { durationMinutes: 'ASC' },
        })
      : [];
    const membershipPlans = tenant.pricingModel === PricingModel.MEMBERSHIP_BASED
      ? await this.membershipRepo.find({
          where: { clubId: tenant.id },
          relations: { prices: true },
          order: { name: 'ASC' },
        })
      : [];
    const clubDurations = [...new Set(locations.flatMap((location) => location.durations))]
      .sort((a, b) => a - b);
    const shiftsByLocation = new Map<string, typeof shifts>();
    for (const shift of shifts) {
      shiftsByLocation.set(shift.locationId, [
        ...(shiftsByLocation.get(shift.locationId) ?? []),
        shift,
      ]);
    }
    const shiftNames = new Map(shifts.map((shift) => [shift.id, shift.name]));

    return {
      tenant: {
        id: tenant.id,
        name: tenant.name,
        slug: tenant.slug,
        pricingModel: tenant.pricingModel,
        isActive: tenant.isActive,
        timezone: tenant.timezone,
      },
      membershipPlans: membershipPlans.map((plan) => ({
        id: plan.id,
        name: plan.name,
        description: plan.description,
        validityDays: plan.validityDays,
        isActive: plan.isActive,
        prices: [...(plan.prices ?? [])]
          .sort((a, b) => a.durationMinutes - b.durationMinutes)
          .map((price) => ({ durationMinutes: price.durationMinutes, price: price.price })),
        missingDurations: clubDurations.filter(
          (duration) => !plan.prices?.some((price) => price.durationMinutes === duration),
        ),
      })),
      dateRange: { today, through, days: 7, dayOfWeek },
      locations: locations.map((location) => ({
        id: location.id,
        name: location.name,
        address: location.address,
        isActive: location.isActive,
        durations: location.durations,
        openingHours: (location.openingHours ?? []).map((hour) => ({
          dayOfWeek: hour.dayOfWeek,
          startTime: toHHmm(hour.startMinute),
          endTime: toHHmm(hour.endMinute),
        })),
        todayUnavailablePeriods: unavailablePeriods
          .filter((period) => period.locationId === location.id && period.date === today)
          .map((period) => this.toUnavailableResponse(period)),
        pricingShifts: (shiftsByLocation.get(location.id) ?? []).map((shift) => ({
          id: shift.id,
          name: shift.name,
          startTime: toHHmm(shift.startMinute),
          endTime: toHHmm(shift.endMinute),
        })),
        courts: courts
          .filter((court) => court.locationId === location.id)
          .map((court) => ({
            id: court.id,
            name: court.name,
            description: court.description,
            isActive: court.isActive,
            durations: court.durations ?? location.durations,
            usesLocationHours: !court.useCustomHours,
            openingHours: court.useCustomHours
              ? (court.openingHours ?? []).map((hour) => ({
                  dayOfWeek: hour.dayOfWeek,
                  startTime: toHHmm(hour.startMinute),
                  endTime: toHHmm(hour.endMinute),
                }))
              : [],
            prices: prices
              .filter((price) => price.courtId === court.id)
              .map((price) => ({
                durationMinutes: price.durationMinutes,
                shiftId: price.shiftId,
                shiftName: price.shiftId ? (shiftNames.get(price.shiftId) ?? 'Unknown') : 'Normal',
                price: price.price,
              })),
          })),
      })),
      upcomingUnavailablePeriods: unavailablePeriods
        .filter((period) => period.date > today)
        .map((period) => ({
          locationId: period.locationId,
          locationName: locations.find((location) => location.id === period.locationId)?.name ?? 'Location',
          ...this.toUnavailableResponse(period),
        })),
    };
  }

  /**
   * Updates the editable club fields after validating any supplied timezone.
   * @param id Club UUID to update.
   * @param dto Optional name and/or timezone; immutable slug and pricing model
   * are excluded by the DTO.
   * @returns Promise of the saved Tenant entity, or HTTP 404 if it does not exist.
   */
  async update(id: string, dto: UpdateTenantDto): Promise<Tenant> {
    this.assertValidTimezone(dto.timezone);
    const tenant = await this.findOne(id);
    Object.assign(tenant, dto);
    return this.tenantRepo.save(tenant);
  }

  /**
   * Activates or deactivates a club. Deactivated clubs cannot be used to sign in.
   * @param id Club UUID whose status should change.
   * @param isActive `true` to activate, `false` to deactivate.
   * @returns Promise of the saved Tenant entity with its new isActive value.
   */
  async setStatus(id: string, isActive: boolean): Promise<Tenant> {
    const tenant = await this.findOne(id);
    tenant.isActive = isActive;
    return this.tenantRepo.save(tenant);
  }

  // Timezone matters later for availability, so reject invalid names early
  /**
   * Checks an optional timezone against the runtime's IANA timezone database.
   * @param timezone IANA timezone name such as `Asia/Kolkata`; omitted values
   * are allowed so the entity/database default can apply.
   * @returns No value on success; throws HTTP 400 for an invalid timezone name.
   */
  private assertValidTimezone(timezone?: string) {
    if (!timezone) return;
    try {
      new Intl.DateTimeFormat('en', { timeZone: timezone });
    } catch {
      throw new BadRequestException(`Invalid timezone "${timezone}"`);
    }
  }

  /**
   * Gets today's calendar date in a club's timezone, formatted as YYYY-MM-DD.
   * @param timezone IANA timezone used to interpret the current instant.
   * @returns Local calendar date string for that timezone.
   */
  private dateInTimezone(timezone: string): string {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(new Date());
    /** @param type Date/time component to find; @returns Its formatted value or an empty string. */
    const part = (type: Intl.DateTimeFormatPartTypes) =>
      parts.find((entry) => entry.type === type)?.value ?? '';
    return `${part('year')}-${part('month')}-${part('day')}`;
  }

  /**
   * Converts a stored closure period from minute offsets into API time strings.
   * @param period Location closure with date, start/end minute offsets, and reason.
   * @returns Plain response fields with `HH:mm` start/end times and calculated duration.
   */
  private toUnavailableResponse(period: LocationUnavailablePeriod) {
    return {
      id: period.id,
      date: period.date,
      startTime: toHHmm(period.startMinute),
      endTime: toHHmm(period.endMinute),
      durationMinutes: period.endMinute - period.startMinute,
      reason: period.reason,
    };
  }
}
