import { describe, expect, it } from 'vitest';
import { addDays, dayOfWeekOf, isRealDate, nowInTimezone } from './date.js';

describe('isRealDate', () => {
  it('accepts real dates and rejects impossible ones', () => {
    expect(isRealDate('2026-12-25')).toBe(true);
    expect(isRealDate('2028-02-29')).toBe(true); // leap year
    expect(isRealDate('2026-02-30')).toBe(false);
    expect(isRealDate('2026-13-01')).toBe(false);
    expect(isRealDate('25-12-2026')).toBe(false);
  });
});

describe('dayOfWeekOf', () => {
  it('uses 0 = Sunday', () => {
    expect(dayOfWeekOf('2026-10-11')).toBe(0); // Sunday
    expect(dayOfWeekOf('2026-10-12')).toBe(1); // Monday
    expect(dayOfWeekOf('2026-12-25')).toBe(5); // Friday
  });
});

describe('addDays', () => {
  it('crosses month ends', () => {
    expect(addDays('2026-02-28', 1)).toBe('2026-03-01');
    expect(addDays('2026-10-08', 60)).toBe('2026-12-07');
  });
});

describe('nowInTimezone', () => {
  const instant = new Date('2026-12-24T20:30:00Z');

  it('converts to the club timezone, including the date', () => {
    expect(nowInTimezone('Asia/Kolkata', instant)).toEqual({ date: '2026-12-25', minute: 120 });
    expect(nowInTimezone('Asia/Dubai', instant)).toEqual({ date: '2026-12-25', minute: 30 });
    expect(nowInTimezone('America/New_York', instant)).toEqual({ date: '2026-12-24', minute: 930 });
  });

  it('reports midnight as minute 0, not 24:00', () => {
    const midnight = new Date('2026-12-24T18:30:00Z');
    expect(nowInTimezone('Asia/Kolkata', midnight)).toEqual({ date: '2026-12-25', minute: 0 });
  });
});