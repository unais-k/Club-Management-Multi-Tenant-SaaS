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
  constructor(
    @InjectRepository(Court) private readonly courtRepo: Repository<Court>,
    @InjectRepository(Location) private readonly locationRepo: Repository<Location>,
    private readonly dataSource: DataSource,
    private readonly bookingsService: BookingsService,
  ) { }

  async create(clubId: string, locationId: string, dto: CreateCourtDto) {
    const location = await this.getLocation(clubId, locationId);
    const name = dto.name.trim();
    await this.assertNameFree(clubId, locationId, name);
    const durations = this.resolveDurations(location, dto.durations);

    try {
      const court = await this.courtRepo.save(
        this.courtRepo.create({
          clubId,
          locationId,
          name,
          description: dto.description?.trim() || null,
          durations,
        }),
      );
      court.openingHours = [];
      return this.toResponse(court, location);
    } catch (err) {
      if (isUniqueViolation(err)) throw this.nameTaken(name);
      throw err;
    }
  }

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

  async findOne(clubId: string, role: UserRole, id: string) {
    const court = await this.getOwned(clubId, id);
    const location = await this.getLocation(clubId, court.locationId, role);
    if (role === UserRole.CONSUMER && !court.isActive) {
      throw new NotFoundException('Court not found');
    }
    return this.toResponse(court, location);
  }

  async update(clubId: string, id: string, dto: UpdateCourtDto) {
    const court = await this.getOwned(clubId, id);
    const location = await this.getLocation(clubId, court.locationId);

    if (dto.name !== undefined) {
      const name = dto.name.trim();
      await this.assertNameFree(clubId, court.locationId, name, id);
      court.name = name;
    }
    if (dto.description !== undefined) court.description = dto.description.trim() || null;
    if (dto.durations !== undefined) {
      court.durations = this.resolveDurations(location, dto.durations);
    }
    if (dto.isActive !== undefined) court.isActive = dto.isActive;

    try {
      return this.toResponse(await this.courtRepo.save(court), location);
    } catch (err) {
      if (isUniqueViolation(err)) throw this.nameTaken(court.name);
      throw err;
    }
  }

  async remove(clubId: string, id: string) {
    await this.getOwned(clubId, id); // 404 if it is not ours

    const upcoming = await this.bookingsService.countUpcoming(clubId, { courtId: id });
    if (upcoming > 0) {
      throw new ConflictException(
        `This court has ${upcoming} upcoming booking(s). Cancel them first.`,
      );
    }
    await this.courtRepo.softDelete({ id, clubId });
  }

  // ---------- Court availability (opening hours) ----------

  async setOpeningHours(clubId: string, id: string, dto: SetCourtOpeningHoursDto) {
    const court = await this.getOwned(clubId, id);
    const location = await this.getLocation(clubId, court.locationId);

    // Option 1: go back to the location's hours
    if (dto.useLocationHours) {
      if (dto.openingHours?.length) {
        throw new BadRequestException(
          'Do not send openingHours when useLocationHours is true',
        );
      }
      await this.dataSource.transaction(async (manager) => {
        await manager.delete(CourtOpeningHour, { courtId: court.id });
        await manager.update(Court, { id: court.id, clubId }, { useCustomHours: false });
      });
      return this.toResponse(await this.getOwned(clubId, id), location);
    }

    // Option 2: custom hours
    if (!dto.openingHours) {
      throw new BadRequestException('openingHours is required when useLocationHours is false');
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
      byDay.set(h.dayOfWeek, [...(byDay.get(h.dayOfWeek) ?? []), { start, end }]);
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
        throw new BadRequestException(`Day ${day}: court opening periods overlap`);
      }
    }

    // Rule 2: a court can never be open when its location is closed
    const problems = findOutsideHours(rows, location.openingHours);
    if (problems.length > 0) {
      throw new BadRequestException(
        `Court hours must be inside the location's opening hours: ${problems.join('; ')}`,
      );
    }

    await this.dataSource.transaction(async (manager) => {
      await manager.delete(CourtOpeningHour, { courtId: court.id });
      if (rows.length > 0) await manager.insert(CourtOpeningHour, rows);
      await manager.update(Court, { id: court.id, clubId }, { useCustomHours: true });
    });

    return this.toResponse(await this.getOwned(clubId, id), location);
  }

  // ---------- Helpers ----------

  // Tenant check: the court must belong to this club
  private async getOwned(clubId: string, id: string): Promise<Court> {
    const court = await this.courtRepo.findOne({
      where: { id, clubId },
      relations: { openingHours: true },
    });
    if (!court) throw new NotFoundException('Court not found');
    return court;
  }

  // Tenant check: the location must belong to this club (consumers: active only)
  private async getLocation(clubId: string, id: string, role?: UserRole): Promise<Location> {
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
  private resolveDurations(location: Location, durations?: number[] | null): number[] | null {
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

  private async assertNameFree(
    clubId: string,
    locationId: string,
    name: string,
    exceptId?: string,
  ) {
    const clash = await this.courtRepo.findOneBy({ clubId, locationId, name });
    if (clash && clash.id !== exceptId) throw this.nameTaken(name);
  }

  private nameTaken(name: string) {
    return new ConflictException(`A court named "${name}" already exists in this location`);
  }

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
        .sort((a, b) => a.dayOfWeek - b.dayOfWeek || a.startMinute - b.startMinute)
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