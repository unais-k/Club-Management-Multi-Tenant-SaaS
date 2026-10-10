/**
 * Pure availability calculations for one court on one date. Functions merge,
 * intersect, and subtract minute ranges to remove closures/bookings, then align
 * candidate slots to the club's duration grid.
 */
import { mergeRanges } from '../common/helpers/schedule.js';
import type { MinuteRange } from '../common/helpers/time.js';

// Everything that decides if a court can be booked, for ONE court on ONE date
/** Input ranges needed to calculate one court's availability for one date. */
export interface DayInput {
  locationHours: MinuteRange[]; // location opening periods for that weekday
  courtHours: MinuteRange[] | null; // null = court follows the location hours
  unavailable: MinuteRange[]; // location unavailable periods on that date
  bookings: MinuteRange[]; // active bookings of the court on that date
}

export type BlockReason =
  | 'OUTSIDE_LOCATION_HOURS'
  | 'OUTSIDE_COURT_HOURS'
  | 'LOCATION_UNAVAILABLE'
  | 'ALREADY_BOOKED';

/** Finds the greatest common divisor used to align duration start grids. */
const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));

/**
 * Finds the shared start-time increment for all offered durations.
 * @param durations Session lengths in minutes, e.g. [30, 60, 90].
 * @returns The greatest common divisor in minutes, e.g. 30.
 */
export function slotStep(durations: number[]): number {
  return durations.reduce((a, b) => gcd(a, b));
}

/**
 * Calculates the overlap between two sets of minute ranges.
 * @param a First ranges; @param b Second ranges.
 * @returns Sorted ranges that exist in both inputs.
 */
export function intersectRanges(a: MinuteRange[], b: MinuteRange[]): MinuteRange[] {
  const A = mergeRanges(a);
  const B = mergeRanges(b);
  const out: MinuteRange[] = [];
  let i = 0;
  let j = 0;
  while (i < A.length && j < B.length) {
    const start = Math.max(A[i].start, B[j].start);
    const end = Math.min(A[i].end, B[j].end);
    if (start < end) out.push({ start, end });
    if (A[i].end < B[j].end) i++;
    else j++;
  }
  return out;
}

/**
 * Removes blocked ranges from a base set of ranges.
 * @param base Initially available ranges; @param remove Ranges to subtract.
 * @returns The remaining sorted free ranges.
 */
export function subtractRanges(base: MinuteRange[], remove: MinuteRange[]): MinuteRange[] {
  let result = mergeRanges(base);
  for (const hole of mergeRanges(remove)) {
    const next: MinuteRange[] = [];
    for (const r of result) {
      if (hole.end <= r.start || hole.start >= r.end) {
        next.push(r); // no contact
        continue;
      }
      if (hole.start > r.start) next.push({ start: r.start, end: hole.start });
      if (hole.end < r.end) next.push({ start: hole.end, end: r.end });
    }
    result = next;
  }
  return result;
}

/**
 * Combines location/court hours, then subtracts closures and existing bookings.
 * @param input Ranges for one court and date.
 * @returns Minute ranges still available to book.
 */
export function computeFreeWindows(input: DayInput): MinuteRange[] {
  const location = mergeRanges(input.locationHours);
  const open = input.courtHours ? intersectRanges(location, input.courtHours) : location;
  return subtractRanges(subtractRanges(open, input.unavailable), input.bookings);
}

/**
 * Generates duration-sized booking options aligned to a start-time grid.
 * @param freeWindows Available ranges; @param durationMinutes Requested session length.
 * @param step Start-time increment; @param earliestStart Minimum permitted start minute.
 * @returns Every slot that fits wholly inside a free range.
 */
export function generateSlots(
  freeWindows: MinuteRange[],
  durationMinutes: number,
  step: number,
  earliestStart = 0,
): MinuteRange[] {
  const slots: MinuteRange[] = [];
  for (const w of freeWindows) {
    // first grid point at or after both the window start and "earliestStart"
    let start = Math.ceil(Math.max(w.start, earliestStart) / step) * step;
    for (; start + durationMinutes <= w.end; start += step) {
      slots.push({ start, end: start + durationMinutes });
    }
  }
  return slots;
}

/**
 * Determines the first reason a requested court time is blocked.
 * @param input Location/court hours, closures, and existing bookings.
 * @param start Requested start minute; @param end Exclusive end minute.
 * @returns `null` when the range is allowed, otherwise its first blocking reason.
 */
export function findBlockingReason(
  input: DayInput,
  start: number,
  end: number,
): BlockReason | null {
  // These predicates keep the checks below readable while using the requested range.
  const fitsInside = (ranges: MinuteRange[]) =>
    mergeRanges(ranges).some((r) => start >= r.start && end <= r.end);
  const overlaps = (ranges: MinuteRange[]) => ranges.some((r) => start < r.end && end > r.start);

  if (!fitsInside(input.locationHours)) return 'OUTSIDE_LOCATION_HOURS';
  if (input.courtHours && !fitsInside(input.courtHours)) return 'OUTSIDE_COURT_HOURS';
  if (overlaps(input.unavailable)) return 'LOCATION_UNAVAILABLE';
  if (overlaps(input.bookings)) return 'ALREADY_BOOKED';
  return null;
}
