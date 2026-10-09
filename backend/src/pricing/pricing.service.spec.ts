import { describe, expect, it, vi } from 'vitest';
import { PricingModel, UserRole } from '../common/enums/index.js';
import { PricingService } from './pricing.service.js';

describe('PricingService membership availability preview', () => {
  it('returns active package rates to a club admin without requiring membership', async () => {
    const listPackageQuotes = vi.fn().mockResolvedValue([
      {
        packageId: 'package-1',
        membershipId: 'plan-1',
        membershipName: 'Gold',
        validityDays: 30,
        bookingDurationMinutes: 60,
        includedBookings: 24,
        price: 25,
        packageFee: 600,
      },
    ]);
    const service = new PricingService(
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      { listPackageQuotes } as never,
    );

    const pricer = await service.createPricer(
      'club-1',
      { id: 'admin-1', clubId: 'club-1', role: UserRole.CLUB_ADMIN },
      {
        model: PricingModel.MEMBERSHIP_BASED,
        locationId: 'location-1',
        courtIds: ['court-1'],
        durationMinutes: 60,
      },
    );

    expect(listPackageQuotes).toHaveBeenCalledWith('club-1', 60, undefined);
    expect(pricer.note).toBeNull();
    expect(pricer.priceFor('court-1', 480)).toEqual({
      price: null,
      prices: [
        {
          packageId: 'package-1',
          membershipId: 'plan-1',
          membershipName: 'Gold',
          validityDays: 30,
          bookingDurationMinutes: 60,
          includedBookings: 24,
          price: 25,
          packageFee: 600,
        },
      ],
    });
  });
});
