import { toHHmm } from '../common/helpers/time.js';

export interface ShiftWindow {
  id: string;
  name: string;
  startMinute: number;
  endMinute: number;
}

export interface PriceEntry {
  durationMinutes: number;
  shiftId: string | null; // null = Normal
  price: number;
}

export interface QuoteSegment {
  shiftId: string | null;
  shiftName: string;
  startTime: string;
  endTime: string;
  minutes: number;
  fullPrice: number; // price of the whole duration in this shift
  amount: number; // part charged for these minutes
}

export class MissingPriceError extends Error {}

export function calculateShiftPrice(input: {
  startMinute: number;
  durationMinutes: number;
  shifts: ShiftWindow[];
  prices: PriceEntry[];
}) {
  const { startMinute, durationMinutes, shifts, prices } = input;
  const endMinute = startMinute + durationMinutes;

  // 1. Cut the booking wherever a shift starts or ends inside it
  const cuts = new Set<number>([startMinute, endMinute]);
  for (const s of shifts) {
    if (s.startMinute > startMinute && s.startMinute < endMinute) cuts.add(s.startMinute);
    if (s.endMinute > startMinute && s.endMinute < endMinute) cuts.add(s.endMinute);
  }
  const points = [...cuts].sort((a, b) => a - b);

  // 2. Price each piece
  const segments: QuoteSegment[] = [];
  let totalCents = 0;

  for (let i = 0; i < points.length - 1; i++) {
    const from = points[i];
    const to = points[i + 1];

    const shift = shifts.find((s) => s.startMinute <= from && to <= s.endMinute) ?? null;
    const label = shift ? shift.name : 'Normal';
    const entry = prices.find(
      (p) => p.durationMinutes === durationMinutes && p.shiftId === (shift?.id ?? null),
    );
    if (!entry) {
      throw new MissingPriceError(
        `No price is set for ${durationMinutes} minutes in the "${label}" shift`,
      );
    }

    // Work in cents so we never accumulate floating-point errors
    const cents = Math.round((entry.price * 100 * (to - from)) / durationMinutes);
    totalCents += cents;

    segments.push({
      shiftId: shift?.id ?? null,
      shiftName: label,
      startTime: toHHmm(from),
      endTime: toHHmm(to),
      minutes: to - from,
      fullPrice: entry.price,
      amount: cents / 100,
    });
  }

  return { total: totalCents / 100, segments };
}