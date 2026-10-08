import { NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { MembershipsService } from './memberships.service.js';

describe('MembershipsService object authorization', () => {
  it('scopes membership cancellation to the authenticated user and club', async () => {
    const userMembershipRepo = { findOneBy: vi.fn().mockResolvedValue(null) };
    const service = new MembershipsService(
      {} as never,
      userMembershipRepo as never,
      {} as never,
      {} as never,
      {} as never,
    );

    await expect(service.cancelMine('club-a', 'user-a', 'subscription-b'))
      .rejects.toBeInstanceOf(NotFoundException);

    expect(userMembershipRepo.findOneBy).toHaveBeenCalledWith({
      id: 'subscription-b',
      clubId: 'club-a',
      userId: 'user-a',
    });
  });
});
