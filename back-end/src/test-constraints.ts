import { 
  findOverlappingFreeSlotsRich, 
  type RichMember, 
  type RichSearchParams 
} from './modules/calendar/findSlotsRich.js';
import { DEFAULT_CONSTRAINTS, type GroupConstraints } from './modules/groups/group.model.js';

function runTest(name: string, members: RichMember[], constraints: Partial<GroupConstraints>, rangeStart: Date, rangeEnd: Date, expectedCondition: (slots: any[], nearMisses: any[]) => string | null) {
  const params: RichSearchParams = {
    rangeStart,
    rangeEnd,
    durationMinutes: 60,
    timezone: 'Asia/Jerusalem',
    constraints: { ...DEFAULT_CONSTRAINTS, ...constraints },
    meetingLocation: null,
    now: new Date('2026-05-15T08:00:00Z'),
    maxResults: 20, // More results to catch violations
  };

  const { slots, nearMisses } = findOverlappingFreeSlotsRich(members, params);
  
  const error = expectedCondition(slots, nearMisses);
  if (error) {
    console.log(`❌ FAIL: ${name}`);
    console.log(`   Reason: ${error}`);
  } else {
    console.log(`✅ PASS: ${name}`);
  }
}

const member1: RichMember = { userId: '1', name: 'רעות', events: [], weekly: null };
const member2: RichMember = { userId: '2', name: 'חבר א', events: [], weekly: null };
const start = new Date('2026-05-17T00:00:00Z');
const end = new Date('2026-05-21T23:59:59Z');

// 1. Base Case
runTest('Base Case', [member1, member2], {}, start, end, (s) => s.length > 0 ? null : 'No slots found');

// 2. Excluded Weekdays (May 18 is Monday = 1)
runTest('Exclude Monday', [member1, member2], { excludedWeekdays: [1] }, start, end, (s) => {
  const hasMonday = s.some(slot => slot.start.getUTCDay() === 1);
  return hasMonday ? 'Found a slot on Monday' : null;
});

// 3. Daily Window (10:00-12:00 local = 07:00-09:00 UTC)
runTest('Daily Window', [member1, member2], { noEarlierThan: 10 * 60, noLaterThan: 12 * 60 }, start, end, (s) => {
  const violation = s.find(slot => {
    const startHour = (slot.start.getUTCHours() + 3) % 24;
    const endHour = (slot.end.getUTCHours() + 3) % 24;
    return startHour < 10 || endHour > 12;
  });
  return violation ? `Slot ${violation.start.toISOString()} outside window` : null;
});

// 4. Lunch Break (13:00-14:00 local = 10:00-11:00 UTC)
runTest('Lunch Break', [member1, member2], { 
  lunchBreak: { enabled: true, startMinute: 13 * 60, endMinute: 14 * 60 } 
}, start, end, (s) => {
  const violation = s.find(slot => {
    const startUTC = slot.start.getUTCHours();
    const endUTC = slot.end.getUTCHours();
    return startUTC === 10 || (startUTC === 9 && slot.end.getUTCMinutes() > 0);
  });
  return violation ? `Slot ${violation.start.toISOString()} overlaps lunch` : null;
});

// 5. Excluded Dates
runTest('Exclude specific date', [member1, member2], { excludedDates: ['2026-05-18'] }, start, end, (s) => {
  const hasExcluded = s.some(slot => slot.start.toISOString().startsWith('2026-05-18'));
  return hasExcluded ? 'Found slot on excluded date' : null;
});

// 6. Buffer (Existing event 10:00-11:00, Buffer 30m)
const memberWithEvent: RichMember = {
  ...member2,
  events: [{
    id: 'ev1', start: new Date('2026-05-17T07:00:00Z'), end: new Date('2026-05-17T08:00:00Z'), // 10:00-11:00 local
    summary: 'פגישה', location: null, importance: 'critical', latLng: null
  }]
};
runTest('Buffer check', [member1, memberWithEvent], { bufferMinutes: 30 }, start, end, (s) => {
  const badSlot = s.find(slot => {
    // Slot should not be between 09:30 and 11:30 local (06:30 and 08:30 UTC)
    const slotStart = slot.start.getTime();
    const slotEnd = slot.end.getTime();
    const blockedStart = new Date('2026-05-17T06:30:00Z').getTime();
    const blockedEnd = new Date('2026-05-17T08:30:00Z').getTime();
    return slotStart < blockedEnd && slotEnd > blockedStart;
  });
  return badSlot ? `Slot ${badSlot.start.toISOString()} violates buffer` : null;
});
