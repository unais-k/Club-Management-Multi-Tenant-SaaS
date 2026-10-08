import { addDays, isRealDate, nowInTimezone } from '../common/helpers/date.js';

export const MAX_DAYS_AHEAD = 60;

export type BookingDateCheck =
  | { ok: true; earliestStart: number } // minutes; 0 for any future date
  | { ok: false; message: string };

// Shared by GET /availability now and by POST /bookings in Step 11
export function evaluateBookingDate(
  date: string,
  timeZone: string,
  now = new Date(),
): BookingDateCheck {
  if (!isRealDate(date)) {
    return { ok: false, message: `"${date}" is not a valid date (use YYYY-MM-DD)` };
  }

  const today = nowInTimezone(timeZone, now);
  if (date < today.date) {
    return { ok: false, message: 'This date is in the past' };
  }
  if (date > addDays(today.date, MAX_DAYS_AHEAD)) {
    return { ok: false, message: `Bookings can be made at most ${MAX_DAYS_AHEAD} days ahead` };
  }

  // Today: nothing before the current minute can be booked
  return { ok: true, earliestStart: date === today.date ? today.minute : 0 };
}