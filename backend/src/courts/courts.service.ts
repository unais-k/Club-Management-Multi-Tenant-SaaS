/**
 * Court business logic: tenant-scoped court CRUD, duration inheritance, custom
 * weekly hours, schedule validation, and protection of existing bookings.
 */
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
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
import { Location } from '../locations/entities/location.entity.js';
import { CreateCourtDto } from './dto/create-court.dto.js';
import { SetCourtOpeningHoursDto } from './dto/set-court-opening-hours.dto.js';
import { UpdateCourtDto } from './dto/update-court.dto.js';
import { CourtOpeningHour } from './entities/court-opening-hour.entity.js';
import { Court } from './entities/court.entity.js';
import { BookingsService } from '../bookings/bookings.service.js';

@Injectable()
export class CourtsService {
  /**
   * @param courtRepo Reads and writes courts and their custom opening hours.
   * @param locationRepo Loads owning locations and their hours/durations.
   * @param dataSource applies court-hours replacements atomically.
   * @param bookingsService rejects court deletion while future bookings exist.
   * @returns No value; Nest injects these dependencies into this service.
   */
  constructor(
    @InjectRepository(Court) private readonly courtRepo: Repository<Court>,
    @InjectRepository(Location)
    private readonly locationRepo: Repository<Location>,
    private readonly dataSource: DataSource,
    private readonly bookingsService: BookingsService,
  ) {}

  /**
   * Creates a court in a club-owned location, validating its name, duration
   * subset, and existence of weekly slots when location hours are configured.
   * @param clubId Authenticated club UUID that owns the location and court.
   * @param locationId Parent location UUID.
   * @param dto Court name, optional description, and optional duration subset.
   * @returns Promise of formatted court details with effective hours/durations.
   */
  async create(clubId: string, locationId: string, dto: CreateCourtDto) {
    const location = await this.getLocation(clubId, locationId);
    const name = dto.name.trim();
    await this.assertNameFree(clubId, locationId, name);
    const durations = this.resolveDurations(location, dto.durations);
    const newCourt = this.courtRepo.create({
      clubId,
      locationId,
      name,
      description: dto.description?.trim() || null,
      durations,
    });
    if (location.openingHours?.length) {
      this.assertWeeklySlots(
        newCourt,
        location,
        newCourt.durations ?? location.durations,
        null,
      );
    }

    try {
      const court = await this.courtRepo.save(newCourt);
      court.openingHours = [];
      return this.toResponse(court, location);
    } catch (err) {
      if (isUniqueViolation(err)) throw this.nameTaken(name);
      throw err;
    }
  }

  /**
   * Lists courts in one location, hiding inactive locations/courts from consumers.
   * @param clubId Authenticated club UUID.
   * @param role Caller role, used to apply consumer visibility rules.
   * @param locationId Parent location UUID.
   * @returns Promise of formatted court responses, ordered by court name.
   */
  async findByLocation(clubId: string, role: UserRole, locationId: string) {
    const location = await this.getLocation(clubId, locationId, role);
    const courts = await this.courtRepo.find({
      where: {
        clubId,
        locationId,
        ...(role === UserRole.CONSUMER && { isActive: true }),
      },
      relations: { openingHours: true },
      order: { name: 'ASC' },
    });
    return courts.map((c) => this.toResponse(c, location));
  }

  /**
   * Loads one court and returns its effective hours and durations, which may be
   * inherited from the parent location.
   * @param clubId Authenticated club UUID.
   * @param role Caller role; inactive courts are hidden from consumers.
   * @param id Court UUID requested.
   * @returns Promise of one formatted court response, or HTTP 404 if not visible.
   */
  async findOne(clubId: string, role: UserRole, id: string) {
    const court = await this.getOwned(clubId, id);
    const location = await this.getLocation(clubId, court.locationId, role);
    if (role === UserRole.CONSUMER && !court.isActive) {
      throw new NotFoundException('Court not found');
    }
    return this.toResponse(court, location);
  }

  /**
   * Updates court details, duration subset, or active state. It prevents removal
   * of bookable durations when the resulting weekly schedule would have no slot.
   * @param clubId Authenticated club UUID.
   * @param id Court UUID to update.
   * @param dto Partial editable court fields.
   * @returns Promise of the saved formatted court response; duplicate names or
   * invalid weekly schedules produce an HTTP error.
   */
  async update(clubId: string, id: string, dto: UpdateCourtDto) {
    const court = await this.getOwned(clubId, id);
    const location = await this.getLocation(clubId, court.locationId);
    const previousDurations = court.durations ?? location.durations;
    const wasActive = court.isActive;

    if (dto.name !== undefined) {
      const name = dto.name.trim();
      await this.assertNameFree(clubId, court.locationId, name, id);
      court.name = name;
    }
    if (dto.description !== undefined)
      court.description = dto.description.trim() || null;
    if (dto.durations !== undefined) {
      court.durations = this.resolveDurations(location, dto.durations);
    }
    if (dto.isActive !== undefined) court.isActive = dto.isActive;

    const durationsChanged =
      (court.durations ?? location.durations).length !== previousDurations.length ||
      (court.durations ?? location.durations).some(
        (duration, index) => duration !== previousDurations[index],
      );
    const activating = !wasActive && court.isActive;
    if ((durationsChanged || activating) && court.isActive && location.openingHours?.length) {
      this.assertWeeklySlots(
        court,
        location,
        court.durations ?? location.durations,
        court.useCustomHours ? court.openingHours : null,
      );
    }

    try {
      return this.toResponse(await this.courtRepo.save(court), location);
    } catch (err) {
      if (isUniqueViolation(err)) throw this.nameTaken(court.name);
      throw err;
    }
  }

  /**
   * Soft-deletes a court only when it has no upcoming confirmed bookings.
   * @param clubId Authenticated club UUID.
   * @param id Court UUID to delete.
   * @returns Promise<void>; throws HTTP 409 if upcoming bookings must be handled first.
   */
  async remove(clubId: string, id: string) {
    await this.getOwned(clubId, id); // 404 if it is not ours

    const upcoming = await this.bookingsService.countUpcoming(clubId, {
      courtId: id,
    });
    if (upcoming > 0) {
      throw new ConflictException(
        `This court has ${upcoming} upcoming booking(s). Cancel them first.`,
      );
    }
    await this.courtRepo.softDelete({ id, clubId });
  }

  // ---------- Court availability (opening hours) ----------

  /**
   * Replaces custom court hours or switches the court back to inheriting location
   * hours. Custom periods must fit inside location hours and provide feasible slots.
   * @param clubId Authenticated club UUID.
   * @param id Court UUID whose hours are being changed.
   * @param dto `useLocationHours` and optional complete custom weekly schedule.
   * @returns Promise of the court response with its effective hours and durations.
   */
  async setOpeningHours(
    clubId: string,
    id: string,
    dto: SetCourtOpeningHoursDto,
  ) {
    const court = await this.getOwned(clubId, id);
    const location = await this.getLocation(clubId, court.locationId);

    // Option 1: go back to the location's hours
    if (dto.useLocationHours) {
      if (dto.openingHours?.length) {
        throw new BadRequestException(
          'Do not send openingHours when useLocationHours is true',
        );
      }
      if (location.openingHours?.length) {
        this.assertWeeklySlots(
          court,
          location,
          court.durations ?? location.durations,
          null,
        );
      }
      await this.dataSource.transaction(async (manager) => {
        await manager.delete(CourtOpeningHour, { courtId: court.id });
        await manager.update(
          Court,
          { id: court.id, clubId },
          { useCustomHours: false },
        );
      });
      return this.toResponse(await this.getOwned(clubId, id), location);
    }

    // Option 2: custom hours
    if (!dto.openingHours) {
      throw new BadRequestException(
        'openingHours is required when useLocationHours is false',
      );
    }

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
        courtId: court.id,
        dayOfWeek: h.dayOfWeek,
        startMinute: start,
        endMinute: end,
      };
    });

    for (const [day, ranges] of byDay) {
      if (hasOverlap(ranges)) {
        throw new BadRequestException(
          `Day ${day}: court opening periods overlap`,
        );
      }
    }

    // Rule 2: a court can never be open when its location is closed
    const problems = findOutsideHours(rows, location.openingHours);
    if (problems.length > 0) {
      throw new BadRequestException(
        `Court hours must be inside the location's opening hours: ${problems.join('; ')}`,
      );
    }

    this.assertWeeklySlots(
      court,
      location,
      court.durations ?? location.durations,
      rows,
    );

    await this.dataSource.transaction(async (manager) => {
      await manager.delete(CourtOpeningHour, { courtId: court.id });
      if (rows.length > 0) await manager.insert(CourtOpeningHour, rows);
      await manager.update(
        Court,
        { id: court.id, clubId },
        { useCustomHours: true },
      );
    });

    return this.toResponse(await this.getOwned(clubId, id), location);
  }

  // ---------- Helpers ----------

  // Tenant check: the court must belong to this club
  /**
   * Finds a court using both court id and club id, including custom opening hours.
   * @param clubId Authenticated club UUID.
   * @param id Court UUID to load.
   * @returns Promise of the owned Court entity; throws HTTP 404 otherwise.
   */
  private async getOwned(clubId: string, id: string): Promise<Court> {
    const court = await this.courtRepo.findOne({
      where: { id, clubId },
      relations: { openingHours: true },
    });
    if (!court) throw new NotFoundException('Court not found');
    return court;
  }

  // Tenant check: the location must belong to this club (consumers: active only)
  /**
   * Loads a location within the authenticated club and optionally enforces its
   * active status for consumer-facing reads.
   * @param clubId Authenticated club UUID.
   * @param id Parent location UUID.
   * @param role Optional caller role; consumers cannot use an inactive location.
   * @returns Promise of the Location entity with weekly hours, or HTTP 404.
   */
  private async getLocation(
    clubId: string,
    id: string,
    role?: UserRole,
  ): Promise<Location> {
    const location = await this.locationRepo.findOne({
      where: { id, clubId },
      relations: { openingHours: true },
    });
    if (!location || (role === UserRole.CONSUMER && !location.isActive)) {
      throw new NotFoundException('Location not found');
    }
    return location;
  }

  // Rule 5: a court can only offer durations its location offers
  /**
   * Resolves court durations: null/undefined means inherit all location durations;
   * otherwise requires a subset and returns it sorted ascending.
   * @param location Parent location and its allowed durations.
   * @param durations Optional requested subset, or null to inherit.
   * @returns Sorted duration subset or null for inheritance; invalid values throw HTTP 400.
   */
  private resolveDurations(
    location: Location,
    durations?: number[] | null,
  ): number[] | null {
    if (!durations) return null; // inherit everything from the location
    const invalid = durations.filter((d) => !location.durations.includes(d));
    if (invalid.length > 0) {
      throw new BadRequestException(
        `Duration(s) ${invalid.join(', ')} are not offered by the location. ` +
          `The location offers: ${location.durations.join(', ')}`,
      );
    }
    return [...durations].sort((a, b) => a - b);
  }

  /**
   * Ensures a court/location schedule intersection has a feasible weekly slot
   * for every duration offered by this court.
   * @param court Court being checked; its name is used in any error message.
   * @param location Parent location with the base schedule and duration grid.
   * @param durations Court's effective offered durations.
   * @param courtHours Custom weekly periods, or null when inheriting location hours.
   * @returns No value when every duration has a valid slot; otherwise HTTP 400.
   */
  private assertWeeklySlots(
    court: Court,
    location: Location,
    durations: number[],
    courtHours:
      | readonly { dayOfWeek: number; startMinute: number; endMinute: number }[]
      | null,
  ) {
    const missing = durationsWithoutWeeklySlots(
      location.openingHours ?? [],
      durations,
      location.durations,
      courtHours,
    );
    if (missing.length) {
      throw new BadRequestException(
        weeklySlotError(`Court "${court.name}"`, missing),
      );
    }
  }

  /**
   * Checks the court name is unique within its club/location, optionally excluding
   * the current court during an update.
   * @param clubId Club UUID defining the tenant boundary.
   * @param locationId Parent location UUID defining the name scope.
   * @param name Trimmed court name to check.
   * @param exceptId Optional current court UUID to ignore.
   * @returns Promise<void>; duplicate names throw the standard HTTP 409 exception.
   */
  private async assertNameFree(
    clubId: string,
    locationId: string,
    name: string,
    exceptId?: string,
  ) {
    const clash = await this.courtRepo.findOneBy({ clubId, locationId, name });
    if (clash && clash.id !== exceptId) throw this.nameTaken(name);
  }

  /**
   * Creates the standard duplicate-court-name conflict error.
   * @param name Duplicate court name.
   * @returns ConflictException describing the location-scoped name conflict.
   */
  private nameTaken(name: string) {
    return new ConflictException(
      `A court named "${name}" already exists in this location`,
    );
  }

  /**
   * Builds the public court response, resolving inherited hours and durations
   * and converting stored minute offsets to HH:mm strings.
   * @param court Court entity, optionally loaded with its custom hours.
   * @param location Parent location entity, including inherited hours/durations.
   * @returns Plain court response with effective durations, customDurations,
   * usesLocationHours, openingHours, and timestamps.
   */
  private toResponse(court: Court, location: Location) {
    const hours = court.useCustomHours
      ? (court.openingHours ?? [])
      : (location.openingHours ?? []);

    return {
      id: court.id,
      locationId: court.locationId,
      name: court.name,
      description: court.description,
      isActive: court.isActive,
      usesLocationHours: !court.useCustomHours,
      durations: court.durations ?? location.durations, // what can be booked
      customDurations: court.durations, // null = follows the location
      openingHours: [...hours]
        .sort(
          (a, b) => a.dayOfWeek - b.dayOfWeek || a.startMinute - b.startMinute,
        )
        .map((h) => ({
          dayOfWeek: h.dayOfWeek,
          openTime: toHHmm(h.startMinute),
          closeTime: toHHmm(h.endMinute),
        })),
      createdAt: court.createdAt,
      updatedAt: court.updatedAt,
    };
  }
}
