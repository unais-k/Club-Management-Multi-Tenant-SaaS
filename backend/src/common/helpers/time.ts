// Accepts "00:00" to "23:59", plus "24:00" (end of day)
export const TIME_PATTERN = /^(?:[01]\d|2[0-3]):[0-5]\d$|^24:00$/;

export interface MinuteRange {
  start: number;
  end: number;
}

export function toMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

export function toHHmm(minutes: number): string {
  const h = String(Math.floor(minutes / 60)).padStart(2, '0');
  const m = String(minutes % 60).padStart(2, '0');
  return `${h}:${m}`;
}

// True if any two ranges overlap. Touching ranges (10-11 and 11-12) do not overlap.
export function hasOverlap(ranges: MinuteRange[]): boolean {
  const sorted = [...ranges].sort((a, b) => a.start - b.start);
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].start < sorted[i - 1].end) return true;
  }
  return false;
}