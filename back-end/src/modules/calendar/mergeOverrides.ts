import type { BusyInterval } from './freebusy.js';

export interface RawOverride {
  start: Date;
  end: Date;
  type: 'busy' | 'free';
}

/**
 * Merge user's manual availability overrides into their Google Calendar busy
 * intervals:
 *
 *   - `busy` overrides → unioned with Google busy (user adds extra blocked time)
 *   - `free` overrides → subtracted from Google busy (user reclaims time the
 *     calendar otherwise marks as busy)
 *
 * Result is a normalized, sorted, non-overlapping list of busy intervals.
 */
export function mergeOverridesIntoBusy(
  googleBusy: BusyInterval[],
  overrides: RawOverride[],
): BusyInterval[] {
  const busyOverrides = overrides.filter((o) => o.type === 'busy');
  const freeOverrides = overrides.filter((o) => o.type === 'free');

  const merged = mergeIntervals([...googleBusy, ...busyOverrides]);
  if (freeOverrides.length === 0) return merged;
  return subtractIntervals(merged, freeOverrides);
}

function mergeIntervals(intervals: Array<{ start: Date; end: Date }>): BusyInterval[] {
  if (intervals.length === 0) return [];
  const sorted = [...intervals].sort((a, b) => a.start.getTime() - b.start.getTime());
  const first = sorted[0]!;
  const out: BusyInterval[] = [{ start: first.start, end: first.end }];
  for (let i = 1; i < sorted.length; i += 1) {
    const last = out[out.length - 1]!;
    const cur = sorted[i]!;
    if (cur.start.getTime() <= last.end.getTime()) {
      if (cur.end.getTime() > last.end.getTime()) last.end = cur.end;
    } else {
      out.push({ start: cur.start, end: cur.end });
    }
  }
  return out;
}

function subtractIntervals(
  busy: BusyInterval[],
  toRemove: RawOverride[],
): BusyInterval[] {
  let working = busy.map((b) => ({ start: b.start, end: b.end }));
  for (const r of toRemove) {
    const next: BusyInterval[] = [];
    for (const b of working) {
      if (r.end <= b.start || r.start >= b.end) {
        // no overlap
        next.push(b);
        continue;
      }
      if (r.start > b.start) {
        next.push({ start: b.start, end: new Date(Math.min(r.start.getTime(), b.end.getTime())) });
      }
      if (r.end < b.end) {
        next.push({ start: new Date(Math.max(r.end.getTime(), b.start.getTime())), end: b.end });
      }
    }
    working = next;
  }
  return working;
}
