import { type MinuteRange, toHHmm } from './time.js';

const DAY_NAMES = [
  'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday',
];
export const dayName = (d: number) => DAY_NAMES[d] ?? `Day ${d}`;

export interface DayRange {
  dayOfWeek: number;
  startMinute: number;
  endMinute: number;
}

// Joins overlapping/touching ranges: 06-12 + 12-14 becomes 06-14
export function mergeRanges(ranges: MinuteRange[]): MinuteRange[] {
  const sorted = [...ranges].sort((a, b) => a.start - b.start);
  const out: MinuteRange[] = [];
  for (const r of sorted) {
    const last = out[out.length - 1];
    if (last && r.start <= last.end) last.end = Math.max(last.end, r.end);
    else out.push({ ...r });
  }
  return out;
}

// Returns a message for every "inner" period that is not fully inside "outer"
export function findOutsideHours(inner: DayRange[], outer: DayRange[]): string[] {
  const outerByDay = new Map<number, MinuteRange[]>();
  for (const o of outer) {
    outerByDay.set(o.dayOfWeek, [
      ...(outerByDay.get(o.dayOfWeek) ?? []),
      { start: o.startMinute, end: o.endMinute },
    ]);
  }

  const problems: string[] = [];
  for (const i of inner) {
    const merged = mergeRanges(outerByDay.get(i.dayOfWeek) ?? []);
    const fits = merged.some((o) => i.startMinute >= o.start && i.endMinute <= o.end);
    if (!fits) {
      const when = `${dayName(i.dayOfWeek)} ${toHHmm(i.startMinute)}-${toHHmm(i.endMinute)}`;
      problems.push(
        merged.length === 0
          ? `${when} (the location is closed on ${dayName(i.dayOfWeek)})`
          : `${when} is outside the location's opening hours`,
      );
    }
  }
  return problems;
}