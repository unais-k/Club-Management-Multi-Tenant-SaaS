/**
 * Location business logic: location CRUD, weekly opening hours, date-specific
 * closures, duration/schedule validation, and protection of existing bookings.
 * Every lookup is scoped by the authenticated club UUID.
 */
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
  /**
   * @param locationRepo Reads and writes tenant-owned locations and weekly hours.
   * @param periodRepo Reads/writes date-specific unavailable periods.
   * @param courtRepo Checks court schedules and duration dependencies.
   * @param dataSource runs atomic updates across location/court schedule rows.
   * @param bookingsService prevents edits/deletions that conflict with bookings.
   * @returns No value; Nest injects these dependencies into this service.
   */
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

  /**
   * Creates a location with normalized fields and sorted offered durations.
   * New locations start with no opening hours (closed until configured).
   * @param clubId Authenticated club UUID that owns the new location.
   * @param dto Location name/address/details and supported booking durations.
   * @returns Promise of the API location response with an empty openingHours array;
   * duplicate names within the club throw HTTP 409.
   */
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

  /**
   * Returns a searchable, paginated list of locations for one club. Consumers
   * see active locations only; club admins can also see inactive locations.
   * @param clubId Authenticated club UUID used to scope the database query.
   * @param role Authenticated role, used to apply the consumer active-only rule.
   * @param query Page, page size, and optional partial-name search.
   * @returns Promise of `{ data, meta }`, with formatted locations and total/page/
   * limit/totalPages metadata.
   */
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

  /**
   * Loads one club-owned location and formats its opening hours. Consumers receive
   * the same not-found result for an inactive location.
   * @param clubId Authenticated club UUID.
   * @param role Authenticated role, used to hide inactive locations from consumers.
   * @param id Location UUID requested by the route.
   * @returns Promise of one formatted location response, or HTTP 404 if unavailable.
   */
  async findOne(clubId: string, role: UserRole, id: string) {
    const location = await this.getOwned(clubId, id);
    if (role === UserRole.CONSUMER && !location.isActive) {
      throw new NotFoundException('Location not found');
    }
    return this.toResponse(location);
  }

  /**
   * Updates location details, durations, or active status. When durations change,
   * it blocks removal of durations used by courts and validates that the location
   * and active courts still have weekly bookable slots.
   * @param clubId Authenticated club UUID.
   * @param id Location UUID to update.
   * @param dto Optional mutable location fields; name uniqueness is club-scoped.
   * @returns Promise of the saved, formatted location response; conflicts or
   * invalid schedules are returned as HTTP errors.
   */
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

  /**
   * Soft-deletes a location and its courts in one transaction after confirming
   * there are no upcoming confirmed bookings under that location.
   * @param clubId Authenticated club UUID.
   * @param id Location UUID to remove.
   * @returns Promise<void> after the soft deletes; upcoming bookings cause HTTP 409.
   */
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
      // @param manager Transaction-scoped EntityManager so both soft deletes commit or roll back together.
      // @returns No value; the transaction is used only for its atomic database changes.
      await manager.softDelete(Court, { clubId, locationId: id });
      await manager.softDelete(Location, { id, clubId });
    });
  }

  // ---------- Opening hours ----------

  /**
   * Replaces the complete weekly schedule after validating time ranges, duplicate
   * overlaps, minimum weekly slots, and all active/custom court schedules.
   * @param clubId Authenticated club UUID.
   * @param id Location UUID whose schedule is replaced.
   * @param dto Complete set of weekly opening periods; omitted days are closed.
   * @returns Promise of the location response with saved opening hours.
   */
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

  /**
   * Adds a one-date closure period after checking the date/time range, overlap
   * with other closures, and conflict with existing confirmed bookings.
   * @param clubId Authenticated club UUID.
   * @param id Location UUID receiving the closure.
   * @param dto Local date, start/end times, and optional reason.
   * @returns Promise of `{ id, date, startTime, endTime, durationMinutes, reason }`.
   */
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

  /**
   * Lists all date-specific closure periods for one club-owned location.
   * @param clubId Authenticated club UUID.
   * @param id Location UUID whose closures are requested.
   * @returns Promise of closure response objects sorted by date then start time.
   */
  async listUnavailablePeriods(clubId: string, id: string) {
    const location = await this.getOwned(clubId, id);
    const periods = await this.periodRepo.find({
      where: { clubId, locationId: location.id },
      order: { date: 'ASC', startMinute: 'ASC' },
    });
    return periods.map((p) => this.toPeriodResponse(p));
  }

  /**
   * Deletes one closure only when it belongs to the requested club and location.
   * @param clubId Authenticated club UUID.
   * @param id Parent location UUID.
   * @param periodId Unavailable-period UUID to delete.
   * @returns Promise<void>; throws HTTP 404 if the period is not under that location.
   */
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
  /**
   * Loads a location by both primary key and club id, including weekly hours.
   * @param clubId Authenticated club UUID.
   * @param id Location UUID requested.
   * @returns Promise of the owned Location entity, or HTTP 404 if not owned/found.
   */
  private async getOwned(clubId: string, id: string): Promise<Location> {
    const location = await this.locationRepo.findOne({
      where: { id, clubId },
      relations: { openingHours: true },
    });
    if (!location) throw new NotFoundException('Location not found');
    return location;
  }

  /**
   * Checks that a location name is unique within a club, allowing the current
   * row during an update when `exceptId` matches.
   * @param clubId Club UUID that defines the uniqueness scope.
   * @param name Trimmed location name to check.
   * @param exceptId Optional location UUID excluded from the collision check.
   * @returns Promise<void>; throws the standard HTTP 409 name-conflict error.
   */
  private async assertNameFree(
    clubId: string,
    name: string,
    exceptId?: string,
  ) {
    const clash = await this.locationRepo.findOneBy({ clubId, name });
    if (clash && clash.id !== exceptId) throw this.nameTaken(name);
  }

  /**
   * Creates the standard conflict exception for duplicate location names.
   * @param name Conflicting location name.
   * @returns ConflictException with a club-scoped duplicate-name message.
   */
  private nameTaken(name: string) {
    return new ConflictException(
      `A location named "${name}" already exists in this club`,
    );
  }

  /**
   * Returns a new ascending-sorted duration array without mutating the input.
   * @param durations Validated durations in minutes.
   * @returns Sorted copy, e.g. `[30, 60, 90]`.
   */
  private sortDurations(durations: number[]): number[] {
    return [...durations].sort((a, b) => a - b);
  }

  /**
   * Ensures a proposed weekly location schedule has at least one feasible slot
   * for each required duration, using the availability schedule validator.
   * @param subject Human-readable schedule name used in any error message.
   * @param locationHours Weekly location ranges in minute offsets.
   * @param durations Durations that must be bookable.
   * @param gridDurations Durations that define valid start-time boundaries.
   * @param courtHours Optional custom court schedule to intersect with location hours.
   * @returns No value when valid; throws HTTP 400 listing durations with no slot.
   */
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

  /**
   * Validates every active court against proposed location hours and durations.
   * @param courts Active courts belonging to the location, with custom hours loaded.
   * @param locationHours Proposed weekly location schedule.
   * @param locationDurations Durations the location will offer.
   * @returns No value when all active courts remain bookable; otherwise HTTP 409.
   */
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

  /**
   * Converts a Location entity to its client response and formats minute offsets
   * as HH:mm weekly opening-hour strings.
   * @param l Location entity, optionally with openingHours loaded.
   * @returns Plain location response with id/name/address/details/durations/status,
   * openingHours, and created/updated timestamps.
   */
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

  /**
   * Converts a closure entity into its API representation.
   * @param p LocationUnavailablePeriod with date and minute offsets.
   * @returns `{ id, date, startTime, endTime, durationMinutes, reason }`.
   */
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
