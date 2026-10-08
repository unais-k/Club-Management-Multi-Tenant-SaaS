import { RedisThrottlerStorage } from './redis-throttler.storage.js';

describe('RedisThrottlerStorage', () => {
  it('maps the atomic Redis response to the Nest throttler record', () => {
    expect(RedisThrottlerStorage.toRecord([12, 45000, 1, 30000])).toEqual({
      totalHits: 12,
      timeToExpire: 45000,
      isBlocked: true,
      timeToBlockExpire: 30000,
    });
  });

  it('normalizes expired Redis TTLs to zero', () => {
    expect(RedisThrottlerStorage.toRecord([1, -2, 0, -2])).toEqual({
      totalHits: 1,
      timeToExpire: 0,
      isBlocked: false,
      timeToBlockExpire: 0,
    });
  });

  it('rejects malformed Redis responses', () => {
    expect(() => RedisThrottlerStorage.toRecord([1, 2])).toThrow(
      'Unexpected response from Redis rate-limit script',
    );
  });
});
