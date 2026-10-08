import { NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { UserRole } from '../common/enums/index.js';
import { BookingsService } from './bookings.service.js';

describe('BookingsService object authorization', () => {
  it('scopes a consumer booking lookup to the authenticated user and club', async () => {
    const tenantRepo = { findOneBy: vi.fn().mockResolvedValue({ id: 'club-a', timezone: 'UTC' }) };
    const bookingRepo = { findOne: vi.fn().mockResolvedValue(null) };
    const service = new BookingsService(
      bookingRepo as never,
      tenantRepo as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );

    await expect(
      service.findOne('club-a', { id: 'user-a', role: UserRole.CONSUMER, clubId: 'club-a' }, 'booking-b'),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(bookingRepo.findOne).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'booking-b', clubId: 'club-a', userId: 'user-a' },
    }));
  });

  it('allows a club admin to access only bookings within their authenticated club', async () => {
    const booking = { id: 'booking-a', clubId: 'club-a', startMinute: 600, endMinute: 660, status: 'CANCELLED' };
    const tenantRepo = { findOneBy: vi.fn().mockResolvedValue({ id: 'club-a', timezone: 'UTC' }) };
    const bookingRepo = { findOne: vi.fn().mockResolvedValue(booking) };
    const service = new BookingsService(
      bookingRepo as never,
      tenantRepo as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );

    await service.findOne('club-a', { id: 'admin-a', role: UserRole.CLUB_ADMIN, clubId: 'club-a' }, 'booking-a');

    expect(bookingRepo.findOne).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'booking-a', clubId: 'club-a' },
    }));
  });
});
