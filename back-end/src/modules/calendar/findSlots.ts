import type { BusyInterval } from './freebusy.js';
import type { GroupConstraints } from '../groups/group.model.js';
import type { DayAvailability } from '../availability/weekly.model.js';

export interface SlotSearchParams {
  rangeStart: Date;
  rangeEnd: Date;
  durationMinutes: number;
  timezone: string;          // IANA, e.g. 'Asia/Jerusalem'
  constraints: GroupConstraints;
  /**
   * Optional per-member weekly schedule. Same length+order as `memberBusy`.
   * `null` for a given member = no weekly schedule set; that member does NOT
   * constrain the slot (matches the same convention as a `null` busy list).
   */
  memberWeekly?: Array<DayAvailability[] | null>;
  now?: Date;                // injected for testability (default: new Date())
  stepMinutes?: number;      // default 30
  maxResults?: number;       // default 5
}

export interface FreeSlot {
  start: Date;
  end: Date;
}

/**
 * Pure function: walks the search range in `stepMinutes` increments and
 * emits slots that satisfy ALL of:
 *   - constraint window  [noEarlierThan, noLaterThan)  in `timezone`
 *   - not on an excluded weekday (in `timezone`)
 *   - not on an excluded YYYY-MM-DD date (in `timezone`)
 *   - not overlapping lunch break (if enabled)
 *   - at least `minNoticeHours` from `now`
 *   - not within `bufferMinutes` of ANY member's busy event
 *   - inside every (non-null) member's weekly availability window
 *
 * Members with `null` busy lists or `null` weekly schedule are treated as
 * "unknown" and SKIPPED — their absence neither blocks nor confirms a slot.
 */
export function findOverlappingFreeSlots(
  memberBusy: Array<BusyInterval[] | null>,
  params: SlotSearchParams,
): FreeSlot[] {
  const {
    rangeStart,
    rangeEnd,
    durationMinutes,
    timezone,
    constraints,
    memberWeekly,
    now = new Date(),
    stepMinutes = 30,
    maxResults = 5,
  } = params;

  const allBusy = memberBusy.filter((b): b is BusyInterval[] => b !== null).flat();
  const durationMs = durationMinutes * 60_000;
  const stepMs = stepMinutes * 60_000;
  const bufferMs = constraints.bufferMinutes * 60_000;
  const noticeCutoff = new Date(now.getTime() + constraints.minNoticeHours * 60 * 60_000);

  const excludedDays = new Set(constraints.excludedWeekdays);
  const excludedDates = new Set(constraints.excludedDates);

  const results: FreeSlot[] = [];
  for (let t = rangeStart.getTime(); t + durationMs <= rangeEnd.getTime(); t += stepMs) {
    const slotStart = new Date(t);
    const slotEnd = new Date(t + durationMs);

    if (slotStart < noticeCutoff) continue;

    const localDay = dayKeyInTimezone(slotStart, timezone);
    if (excludedDates.has(localDay)) continue;
    if (excludedDays.has(weekdayInTimezone(slotStart, timezone))) continue;

    if (!isWithinDailyWindow(slotStart, slotEnd, constraints.noEarlierThan, constraints.noLaterThan, timezone)) {
      continue;
    }

    if (
      constraints.lunchBreak.enabled &&
      overlapsLocalMinuteWindow(
        slotStart,
        slotEnd,
        constraints.lunchBreak.startMinute,
        constraints.lunchBreak.endMinute,
        timezone,
      )
    ) {
      continue;
    }

    if (overlapsAny(slotStart, slotEnd, allBusy, bufferMs)) {
      continue;
    }

    if (memberWeekly && !satisfiesAllMemberWeekly(slotStart, slotEnd, memberWeekly, timezone)) {
      continue;
    }

    results.push({ start: slotStart, end: slotEnd });
    if (results.length >= maxResults) break;
  }
  return results;
}

function satisfiesAllMemberWeekly(
  slotStart: Date,
  slotEnd: Date,
  memberWeekly: Array<DayAvailability[] | null>,
  timezone: string,
): boolean {
  const weekday = weekdayInTimezone(slotStart, timezone);
  const startMin = minuteOfDayInTimezone(slotStart, timezone);
  const endMinusMs = new Date(slotEnd.getTime() - 1);
  const endMin = minuteOfDayInTimezone(endMinusMs, timezone);
  // Slot must stay inside one local day for this check to be meaningful;
  // the daily-window check above already enforces that, so we can assume it.

  for (const days of memberWeekly) {
    if (days === null) continue; // member has no weekly schedule — don't constrain
    const day = days.find((d) => d.day === weekday);
    if (!day || !day.enabled) return false; // member is unavailable this weekday
    const inSomeRange = day.timeRanges.some(
      (r) => startMin >= r.startMinute && endMin < r.endMinute,
    );
    if (!inSomeRange) return false;
  }
  return true;
}

function overlapsAny(start: Date, end: Date, busy: BusyInterval[], bufferMs: number): boolean {
  for (const b of busy) {
    const bStart = new Date(b.start.getTime() - bufferMs);
    const bEnd = new Date(b.end.getTime() + bufferMs);
    if (bStart < end && bEnd > start) return true;
  }
  return false;
}

function isWithinDailyWindow(
  start: Date,
  end: Date,
  windowStartMinute: number,
  windowEndMinute: number,
  timezone: string,
): boolean {
  const startMin = minuteOfDayInTimezone(start, timezone);
  const endMinusMs = new Date(end.getTime() - 1);
  const endMin = minuteOfDayInTimezone(endMinusMs, timezone);
  const sameLocalDay = dayKeyInTimezone(start, timezone) === dayKeyInTimezone(endMinusMs, timezone);
  return sameLocalDay && startMin >= windowStartMinute && endMin < windowEndMinute;
}

function overlapsLocalMinuteWindow(
  start: Date,
  end: Date,
  winStartMinute: number,
  winEndMinute: number,
  timezone: string,
): boolean {
  // Sweep every minute in the slot and check if it falls inside [winStart, winEnd).
  for (let t = start.getTime(); t < end.getTime(); t += 60_000) {
    const m = minuteOfDayInTimezone(new Date(t), timezone);
    if (m >= winStartMinute && m < winEndMinute) return true;
  }
  return false;
}

function minuteOfDayInTimezone(d: Date, timezone: string): number {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  // Some runtimes emit "24:xx" at midnight — normalise.
  const parts = fmt.format(d).split(':');
  const h = parseInt(parts[0] ?? '0', 10) % 24;
  const m = parseInt(parts[1] ?? '0', 10);
  return h * 60 + m;
}

function dayKeyInTimezone(d: Date, timezone: string): string {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return fmt.format(d);
}

function weekdayInTimezone(d: Date, timezone: string): number {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    weekday: 'short',
  });
  const map: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return map[fmt.format(d)] ?? 0;
}
