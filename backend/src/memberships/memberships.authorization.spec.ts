import { describe, expect, it, vi } from 'vitest';
import { MembershipsService } from './memberships.service.js';
import { UserRole } from '../common/enums/index.js';

describe('MembershipsService club scoping', () => {
  it('only searches active consumer accounts in the admin club', async () => {
    const userRepo = { find: vi.fn().mockResolvedValue([]) };
    const service = new MembershipsService(
      {} as never,
      {} as never,
      {} as never,
      userRepo as never,
      {} as never,
      {} as never,
      {} as never,
    );

    await service.searchClubConsumers('club-a', { search: 'aisha' });

    const options = userRepo.find.mock.calls[0][0];
    expect(options.where).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          clubId: 'club-a',
          role: UserRole.CONSUMER,
          isActive: true,
        }),
      ]),
    );
    expect(options.take).toBe(25);
  });
});
