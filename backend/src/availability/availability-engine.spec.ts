import { describe, expect, it } from 'vitest';
import { toMinutes as m } from '../common/helpers/time.js';
import {
  type DayInput,
  computeFreeWindows,
  findBlockingReason,
  generateSlots,
  slotStep,
} from './availability-engine.js';

const r = (from: string, to: string) => ({ start: m(from), end: m(to) });

const day = (over: Partial<DayInput> = {}): DayInput => ({
  locationHours: [r('06:00', '23:00')],
  courtHours: null,
  unavailable: [],
  bookings: [],
  ...over,
});

const starts = (input: DayInput, duration: number, step = 30, earliest = 0) =>
  generateSlots(computeFreeWindows(input), duration, step, earliest).map((s) => s.start);

describe('computeFreeWindows', () => {
  it('returns the whole opening period when nothing blocks it', () => {
    expect(computeFreeWindows(day())).toEqual([r('06:00', '23:00')]);
  });

  it('intersects with the court hours', () => {
    expect(computeFreeWindows(day({ courtHours: [r('08:00', '21:00')] }))).toEqual([
      r('08:00', '21:00'),
    ]);
  });

  it('never lets a court extend beyond its location (Rule 2)', () => {
    const input = day({ locationHours: [r('06:00', '20:00')], courtHours: [r('06:00', '22:00')] });
    expect(computeFreeWindows(input)).toEqual([r('06:00', '20:00')]);
  });

  it('removes unavailable periods and bookings', () => {
    const input = day({
      unavailable: [r('10:00', '15:00')],
      bookings: [r('16:00', '17:00')],
    });
    expect(computeFreeWindows(input)).toEqual([
      r('06:00', '10:00'),
      r('15:00', '16:00'),
      r('17:00', '23:00'),
    ]);
  });

  it('merges touching location periods but keeps real gaps', () => {
    expect(computeFreeWindows(day({ locationHours: [r('06:00', '12:00'), r('12:00', '14:00')] }))).toEqual([
      r('06:00', '14:00'),
    ]);
    expect(computeFreeWindows(day({ locationHours: [r('06:00', '12:00'), r('14:00', '23:00')] }))).toEqual([
      r('06:00', '12:00'),
      r('14:00', '23:00'),
    ]);
  });

  it('returns nothing on a closed day', () => {
    expect(computeFreeWindows(day({ locationHours: [] }))).toEqual([]);
  });

  it('supports a court with split hours inside a longer location day (Rule 4)', () => {
    const input = day({ courtHours: [r('06:00', '12:00'), r('14:00', '23:00')] });
    expect(computeFreeWindows(input)).toEqual([r('06:00', '12:00'), r('14:00', '23:00')]);
  });
});

describe('generateSlots', () => {
  it('lists every start on the step grid that fits', () => {
    const input = day({ locationHours: [r('06:00', '08:00')] });
    expect(starts(input, 60)).toEqual([m('06:00'), m('06:30'), m('07:00')]);
  });

  it('never creates a slot across a closed gap', () => {
    const s = starts(day({ locationHours: [r('06:00', '12:00'), r('14:00', '23:00')] }), 60);
    expect(s).toContain(m('11:00'));
    expect(s).toContain(m('14:00'));
    expect(s).not.toContain(m('11:30'));
    expect(s).not.toContain(m('12:00'));
    expect(s).not.toContain(m('13:30'));
  });

  it('allows a slot across touching location periods', () => {
    const s = starts(day({ locationHours: [r('06:00', '12:00'), r('12:00', '14:00')] }), 60);
    expect(s).toContain(m('11:30'));
  });

  it('excludes slots that overlap an unavailable period but keeps touching ones', () => {
    const s = starts(day({ unavailable: [r('10:00', '15:00')] }), 60);
    expect(s).toContain(m('09:00')); // 09:00-10:00 touches
    expect(s).toContain(m('15:00')); // 15:00-16:00 touches
    expect(s).not.toContain(m('09:30'));
    expect(s).not.toContain(m('10:00'));
    expect(s).not.toContain(m('14:30'));
  });

  it('excludes slots that overlap a booking but keeps adjacent ones', () => {
    const s = starts(day({ bookings: [r('10:00', '11:00')] }), 60);
    expect(s).toContain(m('09:00'));
    expect(s).toContain(m('11:00'));
    expect(s).not.toContain(m('09:30'));
    expect(s).not.toContain(m('10:30'));
  });

  it('hides slots before earliestStart and snaps to the grid', () => {
    expect(starts(day(), 60, 30, m('10:10'))[0]).toBe(m('10:30'));
    expect(starts(day(), 60, 30, m('10:30'))[0]).toBe(m('10:30'));
  });

  it('allows a slot that ends exactly at 24:00', () => {
    const s = starts(day({ locationHours: [r('06:00', '24:00')] }), 60);
    expect(s[s.length - 1]).toBe(m('23:00'));
  });

  it('returns nothing when the duration does not fit any window', () => {
    expect(starts(day({ locationHours: [r('06:00', '06:45')] }), 60)).toEqual([]);
  });
});

describe('slotStep', () => {
  it('is the greatest common divisor of the durations', () => {
    expect(slotStep([30, 60, 90, 120])).toBe(30);
    expect(slotStep([45, 60])).toBe(15);
    expect(slotStep([60])).toBe(60);
  });
});

describe('findBlockingReason', () => {
  it('reports a closed day', () => {
    expect(findBlockingReason(day({ locationHours: [] }), m('10:00'), m('11:00'))).toBe(
      'OUTSIDE_LOCATION_HOURS',
    );
  });

  it('reports a range that spans a closed gap', () => {
    const input = day({ locationHours: [r('06:00', '12:00'), r('14:00', '23:00')] });
    expect(findBlockingReason(input, m('11:00'), m('15:00'))).toBe('OUTSIDE_LOCATION_HOURS');
  });

  it('reports a time outside the court hours but inside the location hours', () => {
    const input = day({ courtHours: [r('08:00', '21:00')] });
    expect(findBlockingReason(input, m('07:00'), m('08:00'))).toBe('OUTSIDE_COURT_HOURS');
  });

  it('reports a location unavailable period', () => {
    const input = day({ unavailable: [r('10:00', '15:00')] });
    expect(findBlockingReason(input, m('10:30'), m('11:30'))).toBe('LOCATION_UNAVAILABLE');
  });

  it('rejects the overlapping booking from the spec (10:00-11:00 booked, 10:30-11:30 requested)', () => {
    const input = day({ bookings: [r('10:00', '11:00')] });
    expect(findBlockingReason(input, m('10:30'), m('11:30'))).toBe('ALREADY_BOOKED');
  });

  it('accepts a booking right after an existing one', () => {
    const input = day({ bookings: [r('10:00', '11:00')] });
    expect(findBlockingReason(input, m('11:00'), m('12:00'))).toBeNull();
  });
});

describe('slots and blocking reasons always agree', () => {
  it('a start is listed as a slot exactly when it has no blocking reason', () => {
    const input: DayInput = {
      locationHours: [r('06:00', '12:00'), r('14:00', '23:00')],
      courtHours: [r('08:00', '21:00')],
      unavailable: [r('10:00', '10:30'), r('18:00', '19:00')],
      bookings: [r('09:00', '10:00'), r('15:30', '16:30')],
    };

    for (const duration of [30, 60, 90, 120]) {
      const listed = new Set(starts(input, duration));
      for (let start = 0; start + duration <= 1440; start += 30) {
        const free = findBlockingReason(input, start, start + duration) === null;
        expect(listed.has(start), `start ${start}, duration ${duration}`).toBe(free);
      }
    }
  });
});