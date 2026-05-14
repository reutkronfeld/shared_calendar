import { z } from 'zod';

/** Coerce "HH:MM" (or "H:MM") to minutes-of-day. */
const timeStringToMinutes = z
  .union([z.string(), z.number()])
  .transform((v) => {
    if (typeof v === 'number') return v;
    const m = /^(\d{1,2}):(\d{2})$/.exec(v.trim());
    if (!m) return Number.NaN;
    return parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
  });

const minuteOfDay = (min: number, max: number) =>
  timeStringToMinutes.refine(
    (n) => Number.isInteger(n) && n >= min && n <= max,
    { message: `נא להזין שעה בין ${formatMin(min)} ל-${formatMin(max)}` },
  );

const intCoerce = (min: number, max: number) =>
  z
    .union([z.string(), z.number()])
    .transform((v) => (typeof v === 'string' ? Number(v) : v))
    .refine((n) => Number.isInteger(n) && n >= min && n <= max, {
      message: `נא להזין מספר שלם בין ${min} ל-${max}`,
    });

export const constraintsSchema = z
  .object({
    excludedWeekdays: z.array(z.number().int().min(0).max(6)),
    noEarlierThan: minuteOfDay(0, 1439),
    noLaterThan: minuteOfDay(1, 1440),
    lunchBreak: z.object({
      enabled: z.boolean(),
      startMinute: minuteOfDay(0, 1439),
      endMinute: minuteOfDay(1, 1440),
    }),
    bufferMinutes: intCoerce(0, 240),
    minNoticeHours: intCoerce(0, 24 * 14),
    excludedDates: z.array(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)),
  })
  .refine((d) => d.noLaterThan > d.noEarlierThan, {
    message: 'שעת הסיום חייבת להיות אחרי שעת ההתחלה',
    path: ['noLaterThan'],
  })
  .refine((d) => d.lunchBreak.endMinute > d.lunchBreak.startMinute, {
    message: 'שעת סיום הצהריים חייבת להיות אחרי שעת ההתחלה',
    path: ['lunchBreak', 'endMinute'],
  });

export type ConstraintsFormInput = z.input<typeof constraintsSchema>;
export type ConstraintsFormOutput = z.output<typeof constraintsSchema>;

export const WEEKDAYS_HE: { value: number; label: string }[] = [
  { value: 0, label: 'ראשון' },
  { value: 1, label: 'שני' },
  { value: 2, label: 'שלישי' },
  { value: 3, label: 'רביעי' },
  { value: 4, label: 'חמישי' },
  { value: 5, label: 'שישי' },
  { value: 6, label: 'שבת' },
];

export function minutesToHHMM(m: number): string {
  const h = Math.floor(m / 60);
  const min = m % 60;
  return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
}
function formatMin(m: number): string {
  return minutesToHHMM(Math.min(1439, m));
}
