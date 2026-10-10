/**
 * Shared booking-date and cancellation-window rules. Date comparisons use the
 * club timezone so they follow the club's local clock rather than the server's.
 */
import { addDays, isRealDate, nowInTimezone } from '../common/helpers/date.js';

/** Maximum number of calendar days ahead that a booking may target. */
export const MAX_DAYS_AHEAD = 60;

/** Result of validating a requested date against the club's booking window. */
export type BookingDateCheck =
  | { ok: true; earliestStart: number } // minutes; 0 for any future date
  | { ok: false; message: string };

// Shared by GET /availability now and by POST /bookings in Step 11
/**
 * @param date Club-local YYYY-MM-DD; @param timeZone club IANA zone; @param now injectable reference instant.
 * @returns Earliest allowed start minute or an error message if outside the booking window.
 */
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

// True once the booking's start minute has been reached in the club's timezone
/**
 * @param date Booking date; @param startMinute local start offset; @param timeZone club IANA zone; @param now reference instant.
 * @returns True once the booking start is reached in club-local time.
 */
export function hasStarted(
  date: string,
  startMinute: number,
  timeZone: string,
  now = new Date(),
): boolean {
  const today = nowInTimezone(timeZone, now);
  return date < today.date || (date === today.date && startMinute <= today.minute);
}

/**
 * Cancellation closes when 30 minutes or less remain before the start.
 * @param date Booking date; @param startMinute local start offset; @param timeZone club IANA zone; @param now reference instant.
 * @returns True for past bookings or when the 30-minute cancellation window has closed.
 */
export function isCancellationWindowClosed(
  date: string,
  startMinute: number,
  timeZone: string,
  now = new Date(),
): boolean {
  const today = nowInTimezone(timeZone, now);
  if (date < today.date) return true;
  if (date > today.date) return false;

  const seconds = Number(
    new Intl.DateTimeFormat('en-GB', {
      timeZone,
      second: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(now)
      .find((part) => part.type === 'second')!.value,
  );
  const milliseconds = now.getMilliseconds();
  const currentMinute = today.minute + seconds / 60 + milliseconds / 60_000;
  return startMinute - currentMinute <= 30;
}
