import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { PricingModel, UserRole } from '../common/enums/index.js';
import { isUniqueViolation } from '../common/helpers/db-errors.js';
import { toHHmm, toMinutes } from '../common/helpers/time.js';
import { Court } from '../courts/entities/court.entity.js';
import { Location } from '../locations/entities/location.entity.js';
import { Tenant } from '../tenants/entities/tenant.entity.js';
import { CreateShiftDto } from './dto/create-shift.dto.js';
import { QuoteQueryDto } from './dto/quote-query.dto.js';
import { SetCourtPricesDto } from './dto/set-court-prices.dto.js';
import { UpdateShiftDto } from './dto/update-shift.dto.js';
import { CourtPrice } from './entities/court-price.entity.js';
import { PricingShift } from './entities/pricing-shift.entity.js';
import { MissingPriceError, calculateShiftPrice } from './pricing-calculator.js';

const RESERVED_SHIFT_NAMES = ['normal', 'default'];

@Injectable()
export class PricingService {
  constructor(
    @InjectRepository(PricingShift) private readonly shiftRepo: Repository<PricingShift>,
    @InjectRepository(CourtPrice) private readonly priceRepo: Repository<CourtPrice>,
    @InjectRepository(Court) private readonly courtRepo: Repository<Court>,
    @InjectRepository(Location) private readonly locationRepo: Repository<Location>,
    @InjectRepository(Tenant) private readonly tenantRepo: Repository<Tenant>,
    private readonly dataSource: DataSource,
  ) {}

  // ---------- Shifts ----------

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

  async listShifts(clubId: string, role: UserRole, locationId: string) {
    const location = await this.getLocation(clubId, locationId, role);
    const shifts = await this.shiftRepo.find({
      where: { clubId, locationId: location.id },
      order: { startMinute: 'ASC' },
    });
    return shifts.map((s) => this.toShiftResponse(s));
  }

  async updateShift(clubId: string, id: string, dto: UpdateShiftDto) {
    const shift = await this.getShift(clubId, id);

    const name = dto.name !== undefined ? this.cleanShiftName(dto.name) : shift.name;
    const start = dto.startTime !== undefined ? toMinutes(dto.startTime) : shift.startMinute;
    const end = dto.endTime !== undefined ? toMinutes(dto.endTime) : shift.endMinute;
    if (start >= end) throw new BadRequestException('endTime must be after startTime');

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
  async removeShift(clubId: string, id: string) {
    await this.getShift(clubId, id); // 404 if it is not ours
    await this.shiftRepo.delete({ id, clubId });
  }

  // ---------- Court prices ----------

  async setCourtPrices(clubId: string, courtId: string, dto: SetCourtPricesDto) {
    await this.assertShiftBased(clubId);
    const { court, location } = await this.getCourtWithLocation(clubId, courtId);
    const offered = court.durations ?? location.durations;

    const shifts = await this.shiftRepo.findBy({ clubId, locationId: location.id });
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

      return { clubId, courtId: court.id, shiftId, durationMinutes: p.durationMinutes, price: p.price };
    });

    // Replace the whole list atomically
    await this.dataSource.transaction(async (manager) => {
      await manager.delete(CourtPrice, { courtId: court.id, clubId });
      if (rows.length > 0) await manager.insert(CourtPrice, rows);
    });

    return this.getCourtPrices(clubId, UserRole.CLUB_ADMIN, courtId);
  }

  async getCourtPrices(clubId: string, role: UserRole, courtId: string) {
    const { court, location } = await this.getCourtWithLocation(clubId, courtId, role);
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
        shiftName: p.shiftId ? (shiftNames.get(p.shiftId) ?? 'Unknown') : 'Normal',
        price: p.price,
      })),
    };

    if (role !== UserRole.CLUB_ADMIN) return response;

    // Help the admin: which (duration, shift) combinations still have no price?
    const missing: { durationMinutes: number; shiftId: string | null; shiftName: string }[] = [];
    for (const duration of offered) {
      for (const slot of [{ id: null as string | null, name: 'Normal' }, ...shifts]) {
        const has = current.some(
          (p) => p.durationMinutes === duration && p.shiftId === slot.id,
        );
        if (!has) missing.push({ durationMinutes: duration, shiftId: slot.id, shiftName: slot.name });
      }
    }
    return { ...response, missing };
  }

  // ---------- Quote ----------

  async quote(clubId: string, role: UserRole, q: QuoteQueryDto) {
    const model = await this.getPricingModel(clubId);
    if (model !== PricingModel.SHIFT_BASED) {
      // Membership-based quotes are added in Step 9
      throw new ConflictException('Membership-based quotes are not available yet');
    }

    const { court, location } = await this.getCourtWithLocation(clubId, q.courtId, role);
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
      return {
        model: PricingModel.SHIFT_BASED,
        courtId: court.id,
        startTime: toHHmm(start),
        endTime: toHHmm(start + q.durationMinutes),
        durationMinutes: q.durationMinutes,
        total: result.total,
        segments: result.segments,
      };
    } catch (err) {
      if (err instanceof MissingPriceError) throw new UnprocessableEntityException(err.message);
      throw err;
    }
  }

  // ---------- Helpers ----------

  private async getPricingModel(clubId: string): Promise<PricingModel> {
    const tenant = await this.tenantRepo.findOneBy({ id: clubId });
    if (!tenant) throw new NotFoundException('Club not found');
    return tenant.pricingModel;
  }

  private async assertShiftBased(clubId: string) {
    if ((await this.getPricingModel(clubId)) !== PricingModel.SHIFT_BASED) {
      throw new ConflictException('This club uses membership-based pricing');
    }
  }

  // Tenant check: shift must belong to this club
  private async getShift(clubId: string, id: string): Promise<PricingShift> {
    const shift = await this.shiftRepo.findOneBy({ id, clubId });
    if (!shift) throw new NotFoundException('Shift not found');
    return shift;
  }

  // Tenant check: location must belong to this club (consumers: active only)
  private async getLocation(clubId: string, id: string, role?: UserRole): Promise<Location> {
    const location = await this.locationRepo.findOneBy({ id, clubId });
    if (!location || (role === UserRole.CONSUMER && !location.isActive)) {
      throw new NotFoundException('Location not found');
    }
    return location;
  }

  // Tenant check: court and its location must belong to this club
  private async getCourtWithLocation(clubId: string, courtId: string, role?: UserRole) {
    const court = await this.courtRepo.findOneBy({ id: courtId, clubId });
    if (!court || (role === UserRole.CONSUMER && !court.isActive)) {
      throw new NotFoundException('Court not found');
    }
    const location = await this.getLocation(clubId, court.locationId, role);
    return { court, location };
  }

  private parseRange(startTime: string, endTime: string) {
    const start = toMinutes(startTime);
    const end = toMinutes(endTime);
    if (start >= end) throw new BadRequestException('endTime must be after startTime');
    return { start, end };
  }

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
    const clash = others.find((s) => start < s.endMinute && end > s.startMinute);
    if (clash) {
      throw new ConflictException(
        `This overlaps the shift "${clash.name}" (${toHHmm(clash.startMinute)}-${toHHmm(clash.endMinute)})`,
      );
    }
  }

  private shiftNameTaken(name: string) {
    return new ConflictException(`A shift named "${name}" already exists in this location`);
  }

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