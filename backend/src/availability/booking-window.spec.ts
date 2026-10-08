import { describe, expect, it } from 'vitest';
import { addDays } from '../common/helpers/date.js';
import { evaluateBookingDate, hasStarted } from './booking-window.js';

const tz = 'Asia/Kolkata';
const now = new Date('2026-10-08T02:40:00Z'); // 08:10 on 2026-10-08 in Kolkata (minute 490)

describe('evaluateBookingDate', () => {
  it('today: nothing before the current minute', () => {
    expect(evaluateBookingDate('2026-10-08', tz, now)).toEqual({ ok: true, earliestStart: 490 });
  });

  it('a future date has no earliest start', () => {
    expect(evaluateBookingDate('2026-10-09', tz, now)).toEqual({ ok: true, earliestStart: 0 });
  });

  it('rejects the past', () => {
    const r = evaluateBookingDate('2026-10-07', tz, now);
    expect(r.ok).toBe(false);
  });

  it('allows 60 days ahead and rejects 61', () => {
    expect(evaluateBookingDate(addDays('2026-10-08', 60), tz, now).ok).toBe(true);
    expect(evaluateBookingDate(addDays('2026-10-08', 61), tz, now).ok).toBe(false);
  });

  it('rejects impossible dates', () => {
    expect(evaluateBookingDate('2026-02-30', tz, now).ok).toBe(false);
  });

  it('uses the club timezone, not UTC', () => {
    // Still 2026-10-08 in UTC, but already 01:30 on 2026-10-09 in Kolkata
    const lateNow = new Date('2026-10-08T20:00:00Z');
    expect(evaluateBookingDate('2026-10-08', tz, lateNow).ok).toBe(false);
    expect(evaluateBookingDate('2026-10-09', tz, lateNow)).toEqual({ ok: true, earliestStart: 90 });
  });
});

describe('hasStarted', () => {
  it('is true for past dates and once the start minute is reached today', () => {
    expect(hasStarted('2026-10-07', 1200, tz, now)).toBe(true);
    expect(hasStarted('2026-10-08', 480, tz, now)).toBe(true); // 08:00, now is 08:10
    expect(hasStarted('2026-10-08', 510, tz, now)).toBe(false); // 08:30
    expect(hasStarted('2026-10-09', 0, tz, now)).toBe(false);
  });
});