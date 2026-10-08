import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Booking } from '../bookings/entities/booking.entity.js';
import { BookingStatus, UserRole } from '../common/enums/index.js';
import { dayOfWeekOf } from '../common/helpers/date.js';
import { type MinuteRange, toHHmm } from '../common/helpers/time.js';
import { AuthUser } from '../common/types/auth-user.js';
import { Court } from '../courts/entities/court.entity.js';
import { LocationUnavailablePeriod } from '../locations/entities/location-unavailable-period.entity.js';
import { Location } from '../locations/entities/location.entity.js';
import { PricingService } from '../pricing/pricing.service.js';
import { Tenant } from '../tenants/entities/tenant.entity.js';
import {
  type DayInput,
  computeFreeWindows,
  generateSlots,
  slotStep,
} from './availability-engine.js';
import { evaluateBookingDate } from './booking-window.js';
import { AvailabilityQueryDto } from './dto/availability-query.dto.js';

const toRange = (r: { startMinute: number; endMinute: number }): MinuteRange => ({
  start: r.startMinute,
  end: r.endMinute,
});

@Injectable()
export class AvailabilityService {
  constructor(
    @InjectRepository(Tenant) private readonly tenantRepo: Repository<Tenant>,
    @InjectRepository(Location) private readonly locationRepo: Repository<Location>,
    @InjectRepository(Court) private readonly courtRepo: Repository<Court>,
    @InjectRepository(LocationUnavailablePeriod)
    private readonly periodRepo: Repository<LocationUnavailablePeriod>,
    @InjectRepository(Booking) private readonly bookingRepo: Repository<Booking>,
    private readonly pricingService: PricingService,
  ) {}

  async getAvailability(clubId: string, user: AuthUser, q: AvailabilityQueryDto) {
    // 1. Club (timezone + pricing model)
    const tenant = await this.tenantRepo.findOneBy({ id: clubId });
    if (!tenant) throw new NotFoundException('Club not found');

    // 2. Location, tenant-checked (consumers only see active locations)
    const location = await this.locationRepo.findOne({
      where: { id: q.locationId, clubId },
      relations: { openingHours: true },
    });
    if (!location || (user.role === UserRole.CONSUMER && !location.isActive)) {
      throw new NotFoundException('Location not found');
    }

    // 3. Request rules
    if (!location.durations.includes(q.durationMinutes)) {
      throw new BadRequestException(
        `Duration ${q.durationMinutes} is not offered by this location. Offered: ${location.durations.join(', ')}`,
      );
    }
    const window = evaluateBookingDate(q.date, tenant.timezone);
    if (!window.ok) throw new BadRequestException(window.message);

    // 4. Load the whole day in a few queries (never one query per slot)
    const weekday = dayOfWeekOf(q.date);
    const [courts, periods, bookings] = await Promise.all([
      this.courtRepo.find({
        where: { clubId, locationId: location.id, isActive: true },
        relations: { openingHours: true },
        order: { name: 'ASC' },
      }),
      this.periodRepo.findBy({ clubId, locationId: location.id, date: q.date }),
      this.bookingRepo.find({
        where: {
          clubId,
          locationId: location.id,
          date: q.date,
          status: BookingStatus.CONFIRMED,
        },
        select: { id: true, courtId: true, startMinute: true, endMinute: true },
      }),
    ]);

    // Courts that do not offer this duration are left out
    const bookable = courts.filter((c) => (c.durations ?? location.durations).includes(q.durationMinutes));

    // 5. Prepare the pricing data once
    const pricer = await this.pricingService.createPricer(clubId, user, {
      model: tenant.pricingModel,
      locationId: location.id,
      courtIds: bookable.map((c) => c.id),
      durationMinutes: q.durationMinutes,
      membershipId: q.membershipId,
    });

    // 6. Run the engine for each court
    const locationHours = location.openingHours
      .filter((h) => h.dayOfWeek === weekday)
      .map(toRange);
    const unavailable = periods.map(toRange);
    const step = slotStep(location.durations);

    const bookedByCourt = new Map<string, MinuteRange[]>();
    for (const b of bookings) {
      const list = bookedByCourt.get(b.courtId) ?? [];
      list.push(toRange(b));
      bookedByCourt.set(b.courtId, list);
    }

    const result = bookable.map((court) => {
      const input: DayInput = {
        locationHours,
        // [] (custom hours, closed that weekday) is different from null (follows the location)
        courtHours: court.useCustomHours
          ? court.openingHours.filter((h) => h.dayOfWeek === weekday).map(toRange)
          : null,
        unavailable,
        bookings: bookedByCourt.get(court.id) ?? [],
      };

      const slots = generateSlots(
        computeFreeWindows(input),
        q.durationMinutes,
        step,
        window.earliestStart,
      ).map((slot) => ({
        startTime: toHHmm(slot.start),
        endTime: toHHmm(slot.end),
        ...pricer.priceFor(court.id, slot.start),
      }));

      return { courtId: court.id, courtName: court.name, slots };
    });

    return {
      locationId: location.id,
      locationName: location.name,
      date: q.date,
      dayOfWeek: weekday,
      durationMinutes: q.durationMinutes,
      timezone: tenant.timezone,
      notice: locationHours.length === 0 ? 'The location is closed on this day' : null,
      pricing: { model: pricer.model, membership: pricer.membership, note: pricer.note },
      courts: result,
    };
  }
}