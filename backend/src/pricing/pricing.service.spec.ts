import { describe, expect, it, vi } from 'vitest';
import { PricingModel, UserRole } from '../common/enums/index.js';
import { PricingService } from './pricing.service.js';

describe('PricingService membership availability preview', () => {
  it('returns prices for all active matching plans to a club admin without requiring membership', async () => {
    const findAll = vi.fn().mockResolvedValue([
      {
        id: 'plan-active',
        name: 'Gold',
        isActive: true,
        prices: [{ durationMinutes: 60, price: 25 }],
      },
      {
        id: 'plan-inactive',
        name: 'Old plan',
        isActive: false,
        prices: [{ durationMinutes: 60, price: 10 }],
      },
      {
        id: 'plan-other-duration',
        name: 'Short plan',
        isActive: true,
        prices: [{ durationMinutes: 30, price: 15 }],
      },
    ]);
    const service = new PricingService(
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      { findAll } as never,
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

    expect(findAll).toHaveBeenCalledWith('club-1', UserRole.CLUB_ADMIN);
    expect(pricer.note).toBeNull();
    expect(pricer.priceFor('court-1', 480)).toEqual({
      price: null,
      prices: [
        { membershipId: 'plan-active', membershipName: 'Gold', price: 25 },
      ],
    });
  });
});
