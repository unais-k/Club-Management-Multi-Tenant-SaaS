import 'reflect-metadata';
import { AuthController } from './auth.controller.js';

describe('AuthController rate limits', () => {
  it.each(['register', 'login', 'refresh'] as const)(
    'applies the stricter limit to %s',
    (endpoint) => {
      const handler = AuthController.prototype[endpoint];
      expect(Reflect.getMetadata('THROTTLER:LIMITdefault', handler)).toBe(10);
      expect(Reflect.getMetadata('THROTTLER:TTLdefault', handler)).toBe(60_000);
    },
  );
});
