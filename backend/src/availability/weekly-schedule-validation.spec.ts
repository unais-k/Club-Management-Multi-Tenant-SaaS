import { describe, expect, it } from 'vitest';
import { durationsWithoutWeeklySlots } from './weekly-schedule-validation.js';

describe('durationsWithoutWeeklySlots', () => {
  it('rejects a one-minute opening window for a 30-minute duration', () => {
    expect(
      durationsWithoutWeeklySlots(
        [{ dayOfWeek: 0, startMinute: 0, endMinute: 1 }],
        [30],
        [30],
      ),
    ).toEqual([30]);
  });

  it('requires a real slot for every duration', () => {
    expect(
      durationsWithoutWeeklySlots(
        [{ dayOfWeek: 2, startMinute: 480, endMinute: 510 }],
        [30, 60],
        [30, 60],
      ),
    ).toEqual([60]);
  });

  it('uses the same slot-start grid as consumer availability', () => {
    expect(
      durationsWithoutWeeklySlots(
        [{ dayOfWeek: 4, startMinute: 495, endMinute: 555 }],
        [60],
        [60],
      ),
    ).toEqual([60]);
  });

  it('checks the intersection of location and custom court hours', () => {
    const location = [{ dayOfWeek: 1, startMinute: 480, endMinute: 600 }];
    expect(
      durationsWithoutWeeklySlots(
        location,
        [60],
        [30, 60],
        [{ dayOfWeek: 1, startMinute: 480, endMinute: 510 }],
      ),
    ).toEqual([60]);
    expect(
      durationsWithoutWeeklySlots(
        location,
        [30, 60],
        [30, 60],
        [{ dayOfWeek: 1, startMinute: 480, endMinute: 600 }],
      ),
    ).toEqual([]);
  });
});
