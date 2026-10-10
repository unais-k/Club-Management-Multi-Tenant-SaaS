/**
 * Pricing domain service. Manages shift windows and court price rows, calculates
 * one-off quotes for both pricing models, and builds a reusable pricer for
 * availability/booking code without repeated database queries per slot.
 */
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import { PricingModel, UserRole } from '../common/enums/index.js';
import { isUniqueViolation } from '../common/helpers/db-errors.js';
import { toHHmm, toMinutes } from '../common/helpers/time.js';
import { AuthUser } from '../common/types/auth-user.js';
import { Court } from '../courts/entities/court.entity.js';
import { Location } from '../locations/entities/location.entity.js';
import { MembershipsService } from '../memberships/memberships.service.js';
import { Tenant } from '../tenants/entities/tenant.entity.js';
import { CreateShiftDto } from './dto/create-shift.dto.js';
import { QuoteQueryDto } from './dto/quote-query.dto.js';
import { SetCourtPricesDto } from './dto/set-court-prices.dto.js';
import { UpdateShiftDto } from './dto/update-shift.dto.js';
import { CourtPrice } from './entities/court-price.entity.js';
import { PricingShift } from './entities/pricing-shift.entity.js';
import {
  MissingPriceError,
  type PriceEntry,
  type QuoteSegment,
  calculateShiftPrice,
} from './pricing-calculator.js';

const RESERVED_SHIFT_NAMES = ['normal', 'default'];

/** Price result for one candidate availability slot. */
export interface SlotPrice {
  price: number | null;
  prices?: {
    packageId: string;
    membershipId: string;
    membershipName: string;
    validityDays: number;
    bookingDurationMinutes: number;
    includedBookings: number;
    price: number;
    packageFee: number;
  }[];
  breakdown?: QuoteSegment[]; // only when the slot crosses two or more shifts
  priceNote?: string; // why the price is missing
}

/** Preloaded price resolver used to quote multiple slots with one set of DB reads. */
export interface Pricer {
  model: PricingModel;
  membership: { id: string; name: string } | null;
  userMembershipId: string | null;
  note: string | null;
  priceFor: (courtId: string, startMinute: number) => SlotPrice;
}

@Injectable()
export class PricingService {
  /**
   * @param shiftRepo Reads/writes location-level shift windows.
   * @param priceRepo Reads/writes court/duration/shift price rows.
   * @param courtRepo validates court ownership and effective durations.
   * @param locationRepo validates location ownership and activity.
   * @param tenantRepo reads the club's fixed pricing model.
   * @param dataSource replaces a court's complete price matrix atomically.
   * @param membershipsService resolves package prices and member quota eligibility.
   * @returns No value; Nest injects these repositories/services.
   */
  constructor(
    @InjectRepository(PricingShift)
    private readonly shiftRepo: Repository<PricingShift>,
    @InjectRepository(CourtPrice)
    private readonly priceRepo: Repository<CourtPrice>,
    @InjectRepository(Court) private readonly courtRepo: Repository<Court>,
    @InjectRepository(Location)
    private readonly locationRepo: Repository<Location>,
    @InjectRepository(Tenant) private readonly tenantRepo: Repository<Tenant>,
    private readonly dataSource: DataSource,
    private readonly membershipsService: MembershipsService,
  ) {}

  // ---------- Shifts ----------

  /**
   * Creates a non-overlapping pricing shift for a location in a shift-priced club.
   * @param clubId Authenticated club UUID.
   * @param dto Location UUID, name, and time boundaries.
   * @returns Promise of `{ id, locationId, name, startTime, endTime }`.
   */
  async createShift(clubId: string, dto: CreateShiftDto) {
    await this.assertShiftBased(clubId);
    const location = await this.getLocation(clubId, dto.locationId);

    const name = this.cleanShiftName(dto.name);
    const { start, end } = this.parseRange(dto.startTime, dto.endTime);
    await this.assertShiftFits(clubId, location.id, name, start, end);

    try {
      const shift = await this.shiftRepo.save(
        this.shiftRepo.create({
          clubId,
          locationId: location.id,
          name,
          startMinute: start,
          endMinute: end,
        }),
      );
      return this.toShiftResponse(shift);
    } catch (err) {
      if (isUniqueViolation(err)) throw this.shiftNameTaken(name);
      throw err;
    }
  }

  /**
   * Lists a location's shifts in start-time order.
   * @param clubId Authenticated club UUID.
   * @param role Caller role; consumers cannot read an inactive location.
   * @param locationId Location UUID.
   * @returns Promise of formatted shift records.
   */
  async listShifts(clubId: string, role: UserRole, locationId: string) {
    const location = await this.getLocation(clubId, locationId, role);
    const shifts = await this.shiftRepo.find({
      where: { clubId, locationId: location.id },
      order: { startMinute: 'ASC' },
    });
    return shifts.map((s) => this.toShiftResponse(s));
  }

  /**
   * Updates shift name/time while ensuring its new range and name do not conflict.
   * @param clubId Authenticated club UUID.
   * @param id Shift UUID.
   * @param dto Partial new name/start/end time.
   * @returns Promise of the updated formatted shift record.
   */
  async updateShift(clubId: string, id: string, dto: UpdateShiftDto) {
    const shift = await this.getShift(clubId, id);

    const name =
      dto.name !== undefined ? this.cleanShiftName(dto.name) : shift.name;
    const start =
      dto.startTime !== undefined
        ? toMinutes(dto.startTime)
        : shift.startMinute;
    const end =
      dto.endTime !== undefined ? toMinutes(dto.endTime) : shift.endMinute;
    if (start >= end)
      throw new BadRequestException('endTime must be after startTime');

    await this.assertShiftFits(clubId, shift.locationId, name, start, end, id);

    shift.name = name;
    shift.startMinute = start;
    shift.endMinute = end;
    try {
      return this.toShiftResponse(await this.shiftRepo.save(shift));
    } catch (err) {
      if (isUniqueViolation(err)) throw this.shiftNameTaken(name);
      throw err;
    }
  }

  // Prices that belong to the shift are removed automatically (ON DELETE CASCADE)
  /**
   * Deletes a shift and lets the database cascade-delete prices attached to it.
   * @param clubId Authenticated club UUID.
   * @param id Shift UUID.
   * @returns Promise<void> after deletion; non-owned shifts return HTTP 404.
   */
  async removeShift(clubId: string, id: string) {
    await this.getShift(clubId, id); // 404 if it is not ours
    await this.shiftRepo.delete({ id, clubId });
  }

  // ---------- Court prices ----------

  /**
   * Replaces all pricing rows for a court after validating durations, shift scope,
   * duplicate combinations, and club pricing model.
   * @param clubId Authenticated club UUID.
   * @param courtId Court UUID whose matrix is replaced.
   * @param dto Complete `{ durationMinutes, shiftId?, price }` list.
   * @returns Promise of the admin price-matrix response with missing combinations.
   */
  async setCourtPrices(
    clubId: string,
    courtId: string,
    dto: SetCourtPricesDto,
  ) {
    await this.assertShiftBased(clubId);
    const { court, location } = await this.getCourtWithLocation(
      clubId,
      courtId,
    );
    const offered = court.durations ?? location.durations;

    const shifts = await this.shiftRepo.findBy({
      clubId,
      locationId: location.id,
    });
    const shiftNames = new Map(shifts.map((s) => [s.id, s.name]));

    const seen = new Set<string>();
    const rows = dto.prices.map((p) => {
      if (!offered.includes(p.durationMinutes)) {
        throw new BadRequestException(
          `Duration ${p.durationMinutes} is not offered by this court. Offered: ${offered.join(', ')}`,
        );
      }
      const shiftId = p.shiftId ?? null;
      if (shiftId && !shiftNames.has(shiftId)) {
        throw new BadRequestException(
          `Shift ${shiftId} does not exist in this court's location`,
        );
      }
      const key = `${p.durationMinutes}:${shiftId ?? 'normal'}`;
      if (seen.has(key)) {
        throw new BadRequestException(
          `Duplicate price for ${p.durationMinutes} minutes in "${shiftId ? shiftNames.get(shiftId) : 'Normal'}"`,
        );
      }
      seen.add(key);

      return {
        clubId,
        courtId: court.id,
        shiftId,
        durationMinutes: p.durationMinutes,
        price: p.price,
      };
    });

    // Replace the whole list atomically
    await this.dataSource.transaction(async (manager) => {
      await manager.delete(CourtPrice, { courtId: court.id, clubId });
      if (rows.length > 0) await manager.insert(CourtPrice, rows);
    });

    return this.getCourtPrices(clubId, UserRole.CLUB_ADMIN, courtId);
  }

  /**
   * Returns effective court durations, applicable shifts, and configured prices.
   * Admins also see missing duration/shift pairs; consumers see only active assets.
   * @param clubId Authenticated club UUID.
   * @param role Caller role controlling visibility and admin-only missing list.
   * @param courtId Court UUID.
   * @returns Promise of `{ courtId, courtName, durations, shifts, prices }`, plus
   * `missing` for club admins.
   */
  async getCourtPrices(clubId: string, role: UserRole, courtId: string) {
    const { court, location } = await this.getCourtWithLocation(
      clubId,
      courtId,
      role,
    );
    const offered = court.durations ?? location.durations;

    const [shifts, prices] = await Promise.all([
      this.shiftRepo.find({
        where: { clubId, locationId: location.id },
        order: { startMinute: 'ASC' },
      }),
      this.priceRepo.findBy({ clubId, courtId: court.id }),
    ]);
    const shiftNames = new Map(shifts.map((s) => [s.id, s.name]));

    // Prices for durations the court no longer offers are ignored
    const current = prices
      .filter((p) => offered.includes(p.durationMinutes))
      .sort((a, b) => a.durationMinutes - b.durationMinutes);

    const response = {
      courtId: court.id,
      courtName: court.name,
      durations: offered,
      shifts: shifts.map((s) => this.toShiftResponse(s)),
      prices: current.map((p) => ({
        durationMinutes: p.durationMinutes,
        shiftId: p.shiftId,
        shiftName: p.shiftId
          ? (shiftNames.get(p.shiftId) ?? 'Unknown')
          : 'Normal',
        price: p.price,
      })),
    };

    if (role !== UserRole.CLUB_ADMIN) return response;

    // Help the admin: which (duration, shift) combinations still have no price?
    const missing: {
      durationMinutes: number;
      shiftId: string | null;
      shiftName: string;
    }[] = [];
    for (const duration of offered) {
      for (const slot of [
        { id: null as string | null, name: 'Normal' },
        ...shifts,
      ]) {
        const has = current.some(
          (p) => p.durationMinutes === duration && p.shiftId === slot.id,
        );
        if (!has)
          missing.push({
            durationMinutes: duration,
            shiftId: slot.id,
            shiftName: slot.name,
          });
      }
    }
    return { ...response, missing };
  }

  // ---------- Quote ----------

  /**
   * Calculates one quote based on the club's configured pricing model. Shift-based
   * prices may split a booking across Normal/shift segments; membership pricing
   * resolves a selected package for admins or the caller's assigned package.
   * @param clubId Authenticated club UUID.
   * @param user Authenticated caller and role.
   * @param q Court UUID, start time, duration, and optional plan/package filters.
   * @returns Promise of quote base fields with `total` and model-specific package
   * or segment information; missing shift rates produce HTTP 422.
   */
  async quote(clubId: string, user: AuthUser, q: QuoteQueryDto) {
    const model = await this.getPricingModel(clubId);
    const { court, location } = await this.getCourtWithLocation(
      clubId,
      q.courtId,
      user.role,
    );

    const offered = court.durations ?? location.durations;
    if (!offered.includes(q.durationMinutes)) {
      throw new BadRequestException(
        `Duration ${q.durationMinutes} is not offered by this court. Offered: ${offered.join(', ')}`,
      );
    }

    const start = toMinutes(q.startTime);
    if (start + q.durationMinutes > 1440) {
      throw new BadRequestException('A booking must end by 24:00');
    }

    const base = {
      model,
      courtId: court.id,
      startTime: toHHmm(start),
      endTime: toHHmm(start + q.durationMinutes),
      durationMinutes: q.durationMinutes,
    };

    // ----- Membership-based club -----
    if (model === PricingModel.MEMBERSHIP_BASED) {
      if (user.role === UserRole.CLUB_ADMIN && !q.packageId) {
        const packages = await this.membershipsService.listPackageQuotes(
          clubId,
          q.durationMinutes,
          q.membershipId,
        );
        return {
          ...base,
          total: null,
          membership: null,
          packages,
          segments: [],
        };
      }

      const resolved = await this.membershipsService.resolvePrice(
        clubId,
        q.durationMinutes,
        {
          role: user.role,
          userId: user.role === UserRole.CONSUMER ? user.id : undefined,
          membershipId: q.membershipId,
          packageId: q.packageId,
        },
      );
      return {
        ...base,
        total: resolved.price,
        membership: resolved.membership,
        package: resolved.package,
        ...(user.role === UserRole.CONSUMER && {
          bookingsRemaining: resolved.bookingsRemaining,
        }),
        segments: [],
      };
    }

    // ----- Shift-based club (unchanged from Step 8) -----
    if (q.membershipId || q.packageId) {
      throw new BadRequestException(
        'membershipId and packageId only apply to membership-based clubs',
      );
    }

    const [shifts, prices] = await Promise.all([
      this.shiftRepo.findBy({ clubId, locationId: location.id }),
      this.priceRepo.findBy({ clubId, courtId: court.id }),
    ]);

    try {
      const result = calculateShiftPrice({
        startMinute: start,
        durationMinutes: q.durationMinutes,
        shifts,
        prices,
      });
      return { ...base, total: result.total, segments: result.segments };
    } catch (err) {
      if (err instanceof MissingPriceError)
        throw new UnprocessableEntityException(err.message);
      throw err;
    }
  }

  // Loads everything needed once, then prices any number of slots with no further queries
  /**
   * Preloads the data needed to price multiple availability slots, then returns
   * a synchronous priceFor function that performs no additional database reads.
   * @param clubId Authenticated club UUID.
   * @param user Authenticated caller; membership pricing depends on role/identity.
   * @param args Pricing model, location, court IDs, duration, and optional plan/package.
   * @returns Promise of a `Pricer` with model/membership/note metadata and a
   * `priceFor(courtId, startMinute)` function returning SlotPrice.
   */
  async createPricer(
    clubId: string,
    user: AuthUser,
    args: {
      model: PricingModel;
      locationId: string;
      courtIds: string[];
      durationMinutes: number;
      membershipId?: string;
      packageId?: string;
    },
  ): Promise<Pricer> {
    const {
      model,
      locationId,
      courtIds,
      durationMinutes,
      membershipId,
      packageId,
    } = args;

    // ----- Membership-based: one price for every slot, resolved once -----
    if (model === PricingModel.MEMBERSHIP_BASED) {
      if (user.role === UserRole.CLUB_ADMIN && !packageId) {
        const prices = await this.membershipsService.listPackageQuotes(
          clubId,
          durationMinutes,
          membershipId,
        );

        return {
          model,
          membership: null,
          userMembershipId: null,
          note: prices.length
            ? null
            : `No active membership package has a price for ${durationMinutes} minutes`,
          priceFor: () => ({ price: null, prices }),
        };
      }

      let price: number | null = null;
      let membership: Pricer['membership'] = null;
      let userMembershipId: string | null = null;
      let note: string | null = null;

      if (user.role === UserRole.CONSUMER || membershipId || packageId) {
        try {
          const resolved = await this.membershipsService.resolvePrice(
            clubId,
            durationMinutes,
            {
              role: user.role,
              userId: user.role === UserRole.CONSUMER ? user.id : undefined,
              membershipId,
              packageId,
            },
          );
          price = resolved.price;
          membership = resolved.membership;
          userMembershipId = resolved.userMembershipId;
        } catch (err) {
          // "no membership" / "no price for this duration": keep the slots, explain the price
          if (!(err instanceof UnprocessableEntityException)) throw err;
          note = err.message;
        }
      } else {
        note = 'Select a package to preview a membership price';
      }

      return {
        model,
        membership,
        userMembershipId,
        note,
        priceFor: () => ({ price }),
      };
    }

    // ----- Shift-based -----
    if (membershipId || packageId) {
      throw new BadRequestException(
        'membershipId and packageId only apply to membership-based clubs',
      );
    }

    const [shifts, prices] = await Promise.all([
      this.shiftRepo.findBy({ clubId, locationId }),
      courtIds.length > 0
        ? this.priceRepo.findBy({ clubId, courtId: In(courtIds) })
        : Promise.resolve([] as CourtPrice[]),
    ]);

    const pricesByCourt = new Map<string, PriceEntry[]>();
    for (const p of prices) {
      const list = pricesByCourt.get(p.courtId) ?? [];
      list.push(p);
      pricesByCourt.set(p.courtId, list);
    }

    return {
      model,
      membership: null,
      userMembershipId: null,
      note: null,
      priceFor: (courtId, startMinute) => {
        try {
          const result = calculateShiftPrice({
            startMinute,
            durationMinutes,
            shifts,
            prices: pricesByCourt.get(courtId) ?? [],
          });
          return {
            price: result.total,
            ...(result.segments.length > 1 && { breakdown: result.segments }),
          };
        } catch (err) {
          if (err instanceof MissingPriceError)
            return { price: null, priceNote: err.message };
          throw err;
        }
      },
    };
  }

  // ---------- Helpers ----------

  /**
   * Reads the club's immutable pricing model.
   * @param clubId Club UUID.
   * @returns Promise of PricingModel; missing club throws HTTP 404.
   */
  private async getPricingModel(clubId: string): Promise<PricingModel> {
    const tenant = await this.tenantRepo.findOneBy({ id: clubId });
    if (!tenant) throw new NotFoundException('Club not found');
    return tenant.pricingModel;
  }

  /**
   * Ensures shift configuration is only changed for a shift-priced club.
   * @param clubId Club UUID.
   * @returns Promise<void>; membership-priced clubs receive HTTP 409.
   */
  private async assertShiftBased(clubId: string) {
    if ((await this.getPricingModel(clubId)) !== PricingModel.SHIFT_BASED) {
      throw new ConflictException('This club uses membership-based pricing');
    }
  }

  // Tenant check: shift must belong to this club
  /**
   * Finds a shift by both id and club id.
   * @param clubId Authenticated club UUID.
   * @param id Shift UUID.
   * @returns Promise of the shift entity, or HTTP 404 when absent/not owned.
   */
  private async getShift(clubId: string, id: string): Promise<PricingShift> {
    const shift = await this.shiftRepo.findOneBy({ id, clubId });
    if (!shift) throw new NotFoundException('Shift not found');
    return shift;
  }

  // Tenant check: location must belong to this club (consumers: active only)
  /**
   * Loads a location inside the club and optionally enforces active state for consumers.
   * @param clubId Authenticated club UUID.
   * @param id Location UUID.
   * @param role Optional caller role; consumers cannot access inactive locations.
   * @returns Promise of the location entity, or HTTP 404 if hidden/not found.
   */
  private async getLocation(
    clubId: string,
    id: string,
    role?: UserRole,
  ): Promise<Location> {
    const location = await this.locationRepo.findOneBy({ id, clubId });
    if (!location || (role === UserRole.CONSUMER && !location.isActive)) {
      throw new NotFoundException('Location not found');
    }
    return location;
  }

  // Tenant check: court and its location must belong to this club
  /**
   * Loads a court and its parent location using the same club scope.
   * @param clubId Authenticated club UUID.
   * @param courtId Court UUID.
   * @param role Optional caller role for active-only consumer visibility.
   * @returns Promise of `{ court, location }`; either unavailable asset returns HTTP 404.
   */
  private async getCourtWithLocation(
    clubId: string,
    courtId: string,
    role?: UserRole,
  ) {
    const court = await this.courtRepo.findOneBy({ id: courtId, clubId });
    if (!court || (role === UserRole.CONSUMER && !court.isActive)) {
      throw new NotFoundException('Court not found');
    }
    const location = await this.getLocation(clubId, court.locationId, role);
    return { court, location };
  }

  /**
   * Parses a shift's HH:mm boundaries to minute offsets and ensures end follows start.
   * @param startTime Shift start in 24-hour HH:mm format.
   * @param endTime Shift end in 24-hour HH:mm format.
   * @returns `{ start, end }` minute offsets, e.g. `{ start: 360, end: 540 }`.
   */
  private parseRange(startTime: string, endTime: string) {
    const start = toMinutes(startTime);
    const end = toMinutes(endTime);
    if (start >= end)
      throw new BadRequestException('endTime must be after startTime');
    return { start, end };
  }

  /**
   * Trims a shift name and rejects empty/reserved Normal/default names.
   * @param raw User-provided shift label.
   * @returns Normalized shift name or HTTP 400 for invalid/reserved names.
   */
  private cleanShiftName(raw: string): string {
    const name = raw.trim();
    if (!name) throw new BadRequestException('Shift name cannot be empty');
    if (RESERVED_SHIFT_NAMES.includes(name.toLowerCase())) {
      throw new BadRequestException(
        `"${name}" is reserved: time outside your shifts automatically uses the Normal price`,
      );
    }
    return name;
  }

  // Name must be unique in the location and the time range must not overlap another shift
  /**
   * Ensures a shift name is unique and its proposed time range overlaps no peer shift.
   * @param clubId Authenticated club UUID.
   * @param locationId Location UUID containing the shifts.
   * @param name Normalized shift name.
   * @param start Proposed start minute.
   * @param end Proposed exclusive end minute.
   * @param exceptId Optional shift UUID excluded during its own update.
   * @returns Promise<void>; duplicate names/ranges throw HTTP 409.
   */
  private async assertShiftFits(
    clubId: string,
    locationId: string,
    name: string,
    start: number,
    end: number,
    exceptId?: string,
  ) {
    const others = (await this.shiftRepo.findBy({ clubId, locationId })).filter(
      (s) => s.id !== exceptId,
    );

    if (others.some((s) => s.name.toLowerCase() === name.toLowerCase())) {
      throw this.shiftNameTaken(name);
    }
    const clash = others.find(
      (s) => start < s.endMinute && end > s.startMinute,
    );
    if (clash) {
      throw new ConflictException(
        `This overlaps the shift "${clash.name}" (${toHHmm(clash.startMinute)}-${toHHmm(clash.endMinute)})`,
      );
    }
  }

  /**
   * Creates the standard conflict exception for duplicate shift names.
   * @param name Conflicting name.
   * @returns ConflictException describing the location-scoped duplicate.
   */
  private shiftNameTaken(name: string) {
    return new ConflictException(
      `A shift named "${name}" already exists in this location`,
    );
  }

  /**
   * Serializes a shift and converts minute offsets to HH:mm strings.
   * @param s PricingShift entity.
   * @returns `{ id, locationId, name, startTime, endTime }`.
   */
  private toShiftResponse(s: PricingShift) {
    return {
      id: s.id,
      locationId: s.locationId,
      name: s.name,
      startTime: toHHmm(s.startMinute),
      endTime: toHHmm(s.endMinute),
    };
  }
}
