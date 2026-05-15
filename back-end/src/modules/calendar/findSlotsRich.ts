import type { CalEvent } from './events.js';
import type { Importance } from './classifier.js';
import type { LatLng } from './geocode.js';
import { estimateTravelMinutes } from './travel.js';
import type { GroupConstraints } from '../groups/group.model.js';
import type { DayAvailability } from '../availability/weekly.model.js';

export interface ClassifiedEvent extends CalEvent {
  importance: Importance;
  latLng: LatLng | null;
}

export interface RichMember {
  userId: string;
  name: string;
  events: ClassifiedEvent[] | null; // null = unknown availability (skipped)
  weekly: DayAvailability[] | null; // null = no weekly schedule set (treated as always available)
}

export interface RichSearchParams {
  rangeStart: Date;
  rangeEnd: Date;
  durationMinutes: number;
  timezone: string;
  constraints: GroupConstraints;
  meetingLocation: LatLng | null;
  now?: Date;
  stepMinutes?: number;
  maxResults?: number;
}

export interface FreeSlot {
  start: Date;
  end: Date;
}

export interface BlockingEvent {
  memberId: string;
  memberName: string;
  eventId: string;
  summary: string;
  start: Date;
  end: Date;
}

export interface NearMissSuggestion {
  slotStart: Date;
  slotEnd: Date;
  movableBlockers: BlockingEvent[];
}

export interface RichSearchResult {
  slots: FreeSlot[];
  nearMisses: NearMissSuggestion[];
}

function effectiveBlockInterval(
  ev: ClassifiedEvent,
  meetingLatLng: LatLng | null,
  baseBufferMs: number,
): { start: number; end: number } {
  const travelMin = estimateTravelMinutes(ev.latLng, meetingLatLng);
  const travelMs = travelMin * 60_000;
  return {
    start: ev.start.getTime() - baseBufferMs - travelMs,
    end: ev.end.getTime() + baseBufferMs + travelMs,
  };
}

/**
 * True if the slot [start,end] falls entirely inside one of the user's
 * weekly availability ranges for that day (local time).
 *
 * Null weekly = no schedule configured → caller treats as "no preference"
 * (we accept the slot from a weekly standpoint and let other gates decide).
 */
function fitsWeekly(
  slotStart: Date,
  slotEnd: Date,
  weekly: DayAvailability[] | null,
  timezone: string,
): boolean {
  if (!weekly) return true;
  const weekday = weekdayInTimezone(slotStart, timezone);
  const day = weekly.find((d) => d.day === weekday);
  if (!day || !day.enabled || day.timeRanges.length === 0) return false;
  const sMin = minuteOfDayInTimezone(slotStart, timezone);
  const eMin = minuteOfDayInTimezone(new Date(slotEnd.getTime() - 1), timezone);
  // Slot must fit within a single range (we don't allow stitching ranges).
  return day.timeRanges.some((r) => sMin >= r.startMinute && eMin < r.endMinute);
}

export function findOverlappingFreeSlotsRich(
  members: RichMember[],
  params: RichSearchParams,
): RichSearchResult {
  const {
    rangeStart,
    rangeEnd,
    durationMinutes,
    timezone,
    constraints,
    meetingLocation,
    now = new Date(),
    stepMinutes = 30,
    maxResults = 5,
  } = params;

  const durationMs = durationMinutes * 60_000;
  const stepMs = stepMinutes * 60_000;
  const baseBufferMs = constraints.bufferMinutes * 60_000;
  const noticeCutoff = new Date(now.getTime() + constraints.minNoticeHours * 60 * 60_000);
  const excludedDays = new Set(constraints.excludedWeekdays);
  const excludedDates = new Set(constraints.excludedDates);

  const slots: FreeSlot[] = [];
  const nearMisses: NearMissSuggestion[] = [];

  for (let t = rangeStart.getTime(); t + durationMs <= rangeEnd.getTime(); t += stepMs) {
    const slotStart = new Date(t);
    const slotEnd = new Date(t + durationMs);

    if (slotStart < noticeCutoff) continue;

    const dayKey = dayKeyInTimezone(slotStart, timezone);
    if (excludedDates.has(dayKey)) continue;
    if (excludedDays.has(weekdayInTimezone(slotStart, timezone))) continue;

    if (
      !isWithinDailyWindow(
        slotStart,
        slotEnd,
        constraints.noEarlierThan,
        constraints.noLaterThan,
        timezone,
      )
    ) {
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

    // Each member's weekly schedule must accept this slot.
    let weeklyOk = true;
    for (const m of members) {
      if (m.events === null) {
        // Unknown availability — we can't be sure it's okay, so we'll treat it as blocked by a virtual movable event later.
        continue;
      }
      if (!fitsWeekly(slotStart, slotEnd, m.weekly, timezone)) {
        weeklyOk = false;
        break;
      }
    }
    if (!weeklyOk) continue;

    let hardBlocked = false;
    const movableBlockers: BlockingEvent[] = [];

    for (const m of members) {
      if (m.events === null) {
        // UNKNOWN availability member: Treat as a movable blocker for EVERY slot 
        // to prevent false "perfect slots".
        movableBlockers.push({
          memberId: m.userId,
          memberName: m.name,
          eventId: `unknown-${m.userId}`,
          summary: 'זמינות לא ידועה (טרם סונכרן יומן)',
          start: slotStart,
          end: slotEnd,
        });
        continue;
      }
      for (const ev of m.events) {
        const eff = effectiveBlockInterval(ev, meetingLocation, baseBufferMs);
        if (eff.start < slotEnd.getTime() && eff.end > slotStart.getTime()) {
          if (ev.importance === 'critical') {
            hardBlocked = true;
            break;
          }
          movableBlockers.push({
            memberId: m.userId,
            memberName: m.name,
            eventId: ev.id,
            summary: ev.summary,
            start: ev.start,
            end: ev.end,
          });
        }
      }
      if (hardBlocked) break;
    }

    if (hardBlocked) continue;

    if (movableBlockers.length === 0) {
      slots.push({ start: slotStart, end: slotEnd });
      if (slots.length >= maxResults) break;
    } else if (nearMisses.length < maxResults * 2) {
      nearMisses.push({ slotStart, slotEnd, movableBlockers });
    }
  }

  return { slots, nearMisses: nearMisses.slice(0, maxResults) };
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
