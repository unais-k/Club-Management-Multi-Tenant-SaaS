/** Checks shift price selection, prorating across boundaries, and missing-price errors. */
import { describe, expect, it } from 'vitest';
import { MissingPriceError, calculateShiftPrice } from './pricing-calculator.js';

const shifts = [
  { id: 'morning', name: 'Morning Peak', startMinute: 360, endMinute: 540 }, // 06-09
  { id: 'evening', name: 'Evening Peak', startMinute: 1020, endMinute: 1200 }, // 17-20
];

const prices = [
  { durationMinutes: 60, shiftId: 'morning', price: 20 },
  { durationMinutes: 60, shiftId: null, price: 15 },
  { durationMinutes: 60, shiftId: 'evening', price: 25 },
];

describe('calculateShiftPrice', () => {
  /** Normal rates apply when the booking falls outside all configured shifts. */
  it('uses the Normal price outside every shift', () => {
    const r = calculateShiftPrice({ startMinute: 720, durationMinutes: 60, shifts, prices });
    expect(r.total).toBe(15);
    expect(r.segments).toHaveLength(1);
  });

  /** A booking contained in a shift uses that shift's configured rate. */
  it('uses the shift price inside a shift', () => {
    const r = calculateShiftPrice({ startMinute: 420, durationMinutes: 60, shifts, prices });
    expect(r.total).toBe(20);
  });

  /** A booking crossing a shift boundary is priced proportionally by segment. */
  it('prorates a booking that crosses from a shift into Normal (08:30-09:30)', () => {
    const r = calculateShiftPrice({ startMinute: 510, durationMinutes: 60, shifts, prices });
    expect(r.segments.map((s) => s.amount)).toEqual([10, 7.5]);
    expect(r.total).toBe(17.5);
  });

  it('prorates a booking that crosses from Normal into a shift (16:30-17:30)', () => {
    const r = calculateShiftPrice({ startMinute: 990, durationMinutes: 60, shifts, prices });
    expect(r.total).toBe(20); // 7.50 Normal + 12.50 Evening
  });

  it('handles a shift in the middle of a booking (3 parts)', () => {
    const r = calculateShiftPrice({
      startMinute: 510,
      durationMinutes: 120,
      shifts: [{ id: 'mid', name: 'Mid', startMinute: 540, endMinute: 600 }],
      prices: [
        { durationMinutes: 120, shiftId: 'mid', price: 40 },
        { durationMinutes: 120, shiftId: null, price: 30 },
      ],
    });
    expect(r.segments).toHaveLength(3);
    expect(r.total).toBe(35); // 7.50 + 20.00 + 7.50
  });

  it('throws when a price is missing', () => {
    expect(() =>
      calculateShiftPrice({
        startMinute: 720,
        durationMinutes: 30,
        shifts,
        prices,
      }),
    ).toThrow(MissingPriceError);
  });
});
