import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, ILike, Repository } from 'typeorm';
import { BookingsService } from '../bookings/bookings.service.js';
import { UserRole } from '../common/enums/index.js';
import { isUniqueViolation } from '../common/helpers/db-errors.js';
import { findOutsideHours } from '../common/helpers/schedule.js';
import {
  durationsWithoutWeeklySlots,
  weeklySlotError,
} from '../availability/weekly-schedule-validation.js';
import {
  type MinuteRange,
  hasOverlap,
  toHHmm,
  toMinutes,
} from '../common/helpers/time.js';
import { Court } from '../courts/entities/court.entity.js';
import { CreateLocationDto } from './dto/create-location.dto.js';
import { CreateUnavailablePeriodDto } from './dto/create-unavailable-period.dto.js';
import { ListLocationsQueryDto } from './dto/list-locations-query.dto.js';
import { SetOpeningHoursDto } from './dto/set-opening-hours.dto.js';
import { UpdateLocationDto } from './dto/update-location.dto.js';
import { LocationOpeningHour } from './entities/location-opening-hour.entity.js';
import { LocationUnavailablePeriod } from './entities/location-unavailable-period.entity.js';
import { Location } from './entities/location.entity.js';

@Injectable()
export class LocationsService {
  constructor(
    @InjectRepository(Location)
    private readonly locationRepo: Repository<Location>,
    @InjectRepository(LocationUnavailablePeriod)
    private readonly periodRepo: Repository<LocationUnavailablePeriod>,
    @InjectRepository(Court)
    private readonly courtRepo: Repository<Court>,
    private readonly dataSource: DataSource,
    private readonly bookingsService: BookingsService,
  ) {}

  // ---------- Locations ----------

  async create(clubId: string, dto: CreateLocationDto) {
    const name = dto.name.trim();
    await this.assertNameFree(clubId, name);

    try {
      const location = await this.locationRepo.save(
        this.locationRepo.create({
          clubId,
          name,
          address: dto.address.trim(),
          details: dto.details?.trim() || null,
          durations: this.sortDurations(dto.durations),
        }),
      );
      location.openingHours = []; // new locations are closed until hours are set
      return this.toResponse(location);
    } catch (err) {
      if (isUniqueViolation(err)) throw this.nameTaken(name);
      throw err;
    }
  }

  async findAll(clubId: string, role: UserRole, query: ListLocationsQueryDto) {
    const { page, limit, search } = query;

    const [rows, total] = await this.locationRepo.findAndCount({
      where: {
        clubId,
        ...(search && { name: ILike(`%${search}%`) }),
        // consumers only see active locations
        ...(role === UserRole.CONSUMER && { isActive: true }),
      },
      relations: { openingHours: true },
      order: { name: 'ASC' },
      skip: (page - 1) * limit,
      take: limit,
    });

    return {
      data: rows.map((l) => this.toResponse(l)),
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async findOne(clubId: string, role: UserRole, id: string) {
    const location = await this.getOwned(clubId, id);
    if (role === UserRole.CONSUMER && !location.isActive) {
      throw new NotFoundException('Location not found');
    }
    return this.toResponse(location);
  }

  async update(clubId: string, id: string, dto: UpdateLocationDto) {
    const location = await this.getOwned(clubId, id);

    if (dto.name !== undefined) {
      const name = dto.name.trim();
      await this.assertNameFree(clubId, name, id);
      location.name = name;
    }
    if (dto.address !== undefined) location.address = dto.address.trim();
    if (dto.details !== undefined)
      location.details = dto.details.trim() || null;
    if (dto.durations !== undefined) {
      const durations = this.sortDurations(dto.durations);
      const durationsChanged =
        durations.length !== location.durations.length ||
        durations.some((duration, index) => duration !== location.durations[index]);
      const courts = await this.courtRepo.find({
        where: { clubId, locationId: id },
        relations: { openingHours: true },
      });
      const blocking = courts.filter((c) =>
        c.durations?.some((d) => !durations.includes(d)),
      );
      if (blocking.length > 0) {
        throw new ConflictException(
          `These courts still use durations you are removing: ${blocking
            .map((c) => c.name)
            .join(', ')}. Update those courts first.`,
        );
      }
      location.durations = durations;
      if (durationsChanged && location.openingHours?.length) {
        this.assertWeeklySlots(
          'Location opening hours',
          location.openingHours,
          durations,
          durations,
        );
        const activeCourts = courts.filter((court) => court.isActive);
        this.assertActiveCourtSchedules(
          activeCourts,
          location.openingHours,
          durations,
        );
      }
    }
    if (dto.isActive !== undefined) location.isActive = dto.isActive;

    try {
      return this.toResponse(await this.locationRepo.save(location));
    } catch (err) {
      if (isUniqueViolation(err)) throw this.nameTaken(location.name);
      throw err;
    }
  }

  async remove(clubId: string, id: string) {
    await this.getOwned(clubId, id); // 404 if it is not ours
    const upcoming = await this.bookingsService.countUpcoming(clubId, {
      locationId: id,
    });
    if (upcoming > 0) {
      throw new ConflictException(
        `This location has ${upcoming} upcoming booking(s). Cancel them first.`,
      );
    }
    await this.dataSource.transaction(async (manager) => {
      await manager.softDelete(Court, { clubId, locationId: id });
      await manager.softDelete(Location, { id, clubId });
    });
  }

  // ---------- Opening hours ----------

  async setOpeningHours(clubId: string, id: string, dto: SetOpeningHoursDto) {
    const location = await this.getOwned(clubId, id);

    const byDay = new Map<number, MinuteRange[]>();
    const rows = dto.openingHours.map((h) => {
      const start = toMinutes(h.openTime);
      const end = toMinutes(h.closeTime);
      if (start >= end) {
        throw new BadRequestException(
          `Day ${h.dayOfWeek}: closeTime must be after openTime (${h.openTime} - ${h.closeTime})`,
        );
      }
      byDay.set(h.dayOfWeek, [
        ...(byDay.get(h.dayOfWeek) ?? []),
        { start, end },
      ]);
      return {
        clubId,
        locationId: location.id,
        dayOfWeek: h.dayOfWeek,
        startMinute: start,
        endMinute: end,
      };
    });

    for (const [day, ranges] of byDay) {
      if (hasOverlap(ranges)) {
        throw new BadRequestException(`Day ${day}: opening periods overlap`);
      }
    }

    // Courts with their own hours must still fit inside the new location hours
    const activeCourts = await this.courtRepo.find({
      where: { clubId, locationId: location.id, isActive: true },
      relations: { openingHours: true },
    });
    this.assertWeeklySlots(
      'Location opening hours',
      rows,
      location.durations,
      location.durations,
    );
    this.assertActiveCourtSchedules(activeCourts, rows, location.durations);
    const customCourts = activeCourts.filter((court) => court.useCustomHours);
    const problems = customCourts.flatMap((c) =>
      findOutsideHours(c.openingHours, rows).map((p) => `${c.name}: ${p}`),
    );
    if (problems.length > 0) {
      throw new ConflictException(
        `These courts would fall outside the new opening hours, update them first: ${problems.join('; ')}`,
      );
    }

    // Replace the whole schedule atomically
    await this.dataSource.transaction(async (manager) => {
      await manager.delete(LocationOpeningHour, { locationId: location.id });
      if (rows.length > 0) await manager.insert(LocationOpeningHour, rows);
    });

    return this.toResponse(await this.getOwned(clubId, id));
  }

  // ---------- Unavailable periods ----------

  async addUnavailablePeriod(
    clubId: string,
    id: string,
    dto: CreateUnavailablePeriodDto,
  ) {
    const location = await this.getOwned(clubId, id);

    // Reject impossible dates such as 2026-02-30
    const parsed = new Date(`${dto.date}T00:00:00Z`);
    if (
      Number.isNaN(parsed.getTime()) ||
      parsed.toISOString().slice(0, 10) !== dto.date
    ) {
      throw new BadRequestException(`"${dto.date}" is not a valid date`);
    }

    const start = toMinutes(dto.startTime);
    const end = toMinutes(dto.endTime);
    if (start >= end) {
      throw new BadRequestException('endTime must be after startTime');
    }

    const sameDay = await this.periodRepo.findBy({
      clubId,
      locationId: location.id,
      date: dto.date,
    });
    const ranges = sameDay.map((p) => ({
      start: p.startMinute,
      end: p.endMinute,
    }));
    if (hasOverlap([...ranges, { start, end }])) {
      throw new ConflictException(
        'This overlaps an existing unavailable period on that date',
      );
    }
    const affected = await this.bookingsService.countOverlapping(
      clubId,
      location.id,
      dto.date,
      start,
      end,
    );
    if (affected > 0) {
      throw new ConflictException(
        `${affected} confirmed booking(s) fall inside this period. Cancel them first.`,
      );
    }

    const period = await this.periodRepo.save(
      this.periodRepo.create({
        clubId,
        locationId: location.id,
        date: dto.date,
        startMinute: start,
        endMinute: end,
        reason: dto.reason?.trim() || null,
      }),
    );
    return this.toPeriodResponse(period);
  }

  async listUnavailablePeriods(clubId: string, id: string) {
    const location = await this.getOwned(clubId, id);
    const periods = await this.periodRepo.find({
      where: { clubId, locationId: location.id },
      order: { date: 'ASC', startMinute: 'ASC' },
    });
    return periods.map((p) => this.toPeriodResponse(p));
  }

  async removeUnavailablePeriod(clubId: string, id: string, periodId: string) {
    const location = await this.getOwned(clubId, id);
    const result = await this.periodRepo.delete({
      id: periodId,
      clubId,
      locationId: location.id,
    });
    if (!result.affected)
      throw new NotFoundException('Unavailable period not found');
  }

  // ---------- Helpers ----------

  // THE tenant check: id AND clubId must both match, otherwise 404
  private async getOwned(clubId: string, id: string): Promise<Location> {
    const location = await this.locationRepo.findOne({
      where: { id, clubId },
      relations: { openingHours: true },
    });
    if (!location) throw new NotFoundException('Location not found');
    return location;
  }

  private async assertNameFree(
    clubId: string,
    name: string,
    exceptId?: string,
  ) {
    const clash = await this.locationRepo.findOneBy({ clubId, name });
    if (clash && clash.id !== exceptId) throw this.nameTaken(name);
  }

  private nameTaken(name: string) {
    return new ConflictException(
      `A location named "${name}" already exists in this club`,
    );
  }

  private sortDurations(durations: number[]): number[] {
    return [...durations].sort((a, b) => a - b);
  }

  private assertWeeklySlots(
    subject: string,
    locationHours: readonly {
      dayOfWeek: number;
      startMinute: number;
      endMinute: number;
    }[],
    durations: number[],
    gridDurations: number[],
    courtHours:
      | readonly { dayOfWeek: number; startMinute: number; endMinute: number }[]
      | null = null,
  ) {
    const missing = durationsWithoutWeeklySlots(
      locationHours,
      durations,
      gridDurations,
      courtHours,
    );
    if (missing.length)
      throw new BadRequestException(weeklySlotError(subject, missing));
  }

  private assertActiveCourtSchedules(
    courts: Court[],
    locationHours: readonly {
      dayOfWeek: number;
      startMinute: number;
      endMinute: number;
    }[],
    locationDurations: number[],
  ) {
    for (const court of courts) {
      const offered = court.durations ?? locationDurations;
      const courtHours = court.useCustomHours ? court.openingHours : null;
      const missing = durationsWithoutWeeklySlots(
        locationHours,
        offered,
        locationDurations,
        courtHours,
      );
      if (missing.length) {
        throw new ConflictException(
          weeklySlotError(`Court "${court.name}"`, missing),
        );
      }
    }
  }

  private toResponse(l: Location) {
    return {
      id: l.id,
      name: l.name,
      address: l.address,
      details: l.details,
      durations: l.durations,
      isActive: l.isActive,
      openingHours: (l.openingHours ?? [])
        .sort(
          (a, b) => a.dayOfWeek - b.dayOfWeek || a.startMinute - b.startMinute,
        )
        .map((h) => ({
          dayOfWeek: h.dayOfWeek,
          openTime: toHHmm(h.startMinute),
          closeTime: toHHmm(h.endMinute),
        })),
      createdAt: l.createdAt,
      updatedAt: l.updatedAt,
    };
  }

  private toPeriodResponse(p: LocationUnavailablePeriod) {
    return {
      id: p.id,
      date: p.date,
      startTime: toHHmm(p.startMinute),
      endTime: toHHmm(p.endMinute),
      durationMinutes: p.endMinute - p.startMinute,
      reason: p.reason,
    };
  }
}
