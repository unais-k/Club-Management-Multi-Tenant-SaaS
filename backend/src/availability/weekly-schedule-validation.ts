/**
 * Validates recurring weekly location/court schedules against required booking
 * durations, ensuring each advertised duration has at least one real slot.
 */
import {
  computeFreeWindows,
  generateSlots,
  slotStep,
} from './availability-engine.js';
import type { MinuteRange } from '../common/helpers/time.js';

/** Weekly schedule row represented using weekday index and minute offsets. */
export interface WeeklyHours {
  dayOfWeek: number;
  startMinute: number;
  endMinute: number;
}

/** Durations for which the weekly schedule cannot produce a consumer-bookable slot. */
/**
 * @param locationHours Recurring location open periods.
 * @param durations Durations that must each be bookable.
 * @param slotGridDurations Durations defining the legal start-time step.
 * @param courtHours Optional custom court periods; null means inherit location hours.
 * @returns Offered durations with no possible slot in the week; empty means valid.
 */
export function durationsWithoutWeeklySlots(
  locationHours: readonly WeeklyHours[],
  durations: readonly number[],
  slotGridDurations: readonly number[],
  courtHours: readonly WeeklyHours[] | null = null,
): number[] {
  if (slotGridDurations.length === 0) return [...durations];
  const step = slotStep([...slotGridDurations]);
  return durations.filter((duration) => {
    for (let dayOfWeek = 0; dayOfWeek < 7; dayOfWeek += 1) {
      const ranges = (hours: readonly WeeklyHours[]): MinuteRange[] =>
        hours
          .filter((row) => row.dayOfWeek === dayOfWeek)
          .map(({ startMinute, endMinute }) => ({
            start: startMinute,
            end: endMinute,
          }));
      const free = computeFreeWindows({
        locationHours: ranges(locationHours),
        courtHours: courtHours === null ? null : ranges(courtHours),
        unavailable: [],
        bookings: [],
      });
      if (generateSlots(free, duration, step).length > 0) return false;
    }
    return true;
  });
}

/**
 * Formats a readable error naming durations that cannot fit in the weekly schedule.
 * @param subject Human-readable location/court label.
 * @param durations Missing booking durations.
 * @returns Explanation listing missing slot lengths and suggesting a schedule correction.
 */
export function weeklySlotError(
  subject: string,
  durations: readonly number[],
): string {
  const list = durations.map((duration) => `${duration}-minute`).join(', ');
  return `${subject} must allow at least one bookable slot per week for each offered duration. No ${list} slot${durations.length === 1 ? '' : 's'} is possible; extend the weekly hours or remove the unavailable duration${durations.length === 1 ? '' : 's'}.`;
}
