import { mergeRanges } from '../common/helpers/schedule.js';
import type { MinuteRange } from '../common/helpers/time.js';

// Everything that decides if a court can be booked, for ONE court on ONE date
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

const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));

// 30,60,90,120 -> 30    45,60 -> 15    60 -> 60
export function slotStep(durations: number[]): number {
  return durations.reduce((a, b) => gcd(a, b));
}

// The parts of A that are also inside B
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

// The parts of "base" that are NOT covered by "remove"
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

// Time that can still be booked: open hours minus unavailable periods minus bookings
export function computeFreeWindows(input: DayInput): MinuteRange[] {
  const location = mergeRanges(input.locationHours);
  const open = input.courtHours ? intersectRanges(location, input.courtHours) : location;
  return subtractRanges(subtractRanges(open, input.unavailable), input.bookings);
}

// All bookable slots of one duration. Starts sit on the step grid.
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

// Checks one requested range. null = it can be booked, otherwise the first reason it cannot.
export function findBlockingReason(
  input: DayInput,
  start: number,
  end: number,
): BlockReason | null {
  const fitsInside = (ranges: MinuteRange[]) =>
    mergeRanges(ranges).some((r) => start >= r.start && end <= r.end);
  const overlaps = (ranges: MinuteRange[]) => ranges.some((r) => start < r.end && end > r.start);

  if (!fitsInside(input.locationHours)) return 'OUTSIDE_LOCATION_HOURS';
  if (input.courtHours && !fitsInside(input.courtHours)) return 'OUTSIDE_COURT_HOURS';
  if (overlaps(input.unavailable)) return 'LOCATION_UNAVAILABLE';
  if (overlaps(input.bookings)) return 'ALREADY_BOOKED';
  return null;
}