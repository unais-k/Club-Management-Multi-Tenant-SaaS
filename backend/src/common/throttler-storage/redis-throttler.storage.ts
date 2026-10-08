import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { ThrottlerStorage } from '@nestjs/throttler';
import { Redis } from 'ioredis';
import { createHash } from 'node:crypto';

type ThrottlerStorageRecord = {
  totalHits: number;
  timeToExpire: number;
  isBlocked: boolean;
  timeToBlockExpire: number;
};

const INCREMENT_SCRIPT = `
local blockedTtl = redis.call('PTTL', KEYS[2])
if blockedTtl > 0 then
  local hits = tonumber(redis.call('GET', KEYS[1])) or tonumber(ARGV[2]) + 1
  return { hits, redis.call('PTTL', KEYS[1]), 1, blockedTtl }
end

local hits = redis.call('INCR', KEYS[1])
if hits == 1 then
  redis.call('PEXPIRE', KEYS[1], ARGV[1])
end

if hits > tonumber(ARGV[2]) then
  redis.call('SET', KEYS[2], '1', 'PX', ARGV[3])
  return { hits, redis.call('PTTL', KEYS[1]), 1, tonumber(ARGV[3]) }
end

return { hits, redis.call('PTTL', KEYS[1]), 0, 0 }
`;

@Injectable()
export class RedisThrottlerStorage
  implements ThrottlerStorage, OnModuleDestroy
{
  private readonly logger = new Logger(RedisThrottlerStorage.name);
  private readonly redis?: InstanceType<typeof Redis>;

  constructor(config: ConfigService) {
    const redisUrl = config.get<string>('REDIS_URL');
    if (redisUrl) {
      this.redis = new Redis(redisUrl, {
        connectTimeout: 5_000,
        maxRetriesPerRequest: 1,
        enableOfflineQueue: false,
      });
    } else {
      this.logger.warn(
        'REDIS_URL is unset; using the default in-memory throttling storage.',
      );
    }
  }

  get configured(): boolean {
    return this.redis !== undefined;
  }

  async increment(
    key: string,
    ttl: number,
    limit: number,
    blockDuration: number,
    throttlerName: string,
  ): Promise<ThrottlerStorageRecord> {
    if (!this.redis) {
      throw new Error(
        'Redis storage is not configured; use Nest default storage instead.',
      );
    }

    const digest = createHash('sha256')
      .update(`${throttlerName}:${key}`)
      .digest('hex');
    const result = (await this.redis.eval(
      INCREMENT_SCRIPT,
      2,
      `throttle:${digest}:hits`,
      `throttle:${digest}:blocked`,
      String(ttl),
      String(limit),
      String(blockDuration),
    )) as Array<number | string>;

    return RedisThrottlerStorage.toRecord(result);
  }

  async onModuleDestroy(): Promise<void> {
    if (this.redis) await this.redis.quit();
  }

  static toRecord(result: Array<number | string>): ThrottlerStorageRecord {
    if (result.length !== 4)
      throw new Error('Unexpected response from Redis rate-limit script');
    const [totalHits, timeToExpire, isBlocked, timeToBlockExpire] =
      result.map(Number);
    return {
      totalHits,
      timeToExpire: Math.max(0, timeToExpire),
      isBlocked: isBlocked === 1,
      timeToBlockExpire: Math.max(0, timeToBlockExpire),
    };
  }
}
