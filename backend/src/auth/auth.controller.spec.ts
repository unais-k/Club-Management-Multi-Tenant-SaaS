/**
 * Focused metadata tests for the stricter rate limits on public auth routes.
 * These tests inspect Nest decorator metadata; they do not make HTTP requests.
 */
import 'reflect-metadata';
import { AuthController } from './auth.controller.js';

/** Groups checks for the stricter throttling applied to public auth routes. */
describe('AuthController rate limits', () => {
  /** Iterates the public credential endpoints and verifies each has a 10/minute cap. */
  it.each(['register', 'login', 'refresh'] as const)(
    'applies the stricter limit to %s',
    /**
     * Checks the configured throttle metadata on one controller method.
     * @param endpoint Controller method whose metadata is under test.
     * @returns No value; Jest assertions fail the test if metadata differs.
     */
    (endpoint) => {
      const handler = AuthController.prototype[endpoint];
      expect(Reflect.getMetadata('THROTTLER:LIMITdefault', handler)).toBe(10);
      expect(Reflect.getMetadata('THROTTLER:TTLdefault', handler)).toBe(60_000);
    },
  );
});
