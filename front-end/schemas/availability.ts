import { z } from 'zod';

const intInRange = (min: number, max: number) =>
  z
    .union([z.string(), z.number()])
    .transform((v) => (typeof v === 'string' ? Number(v) : v))
    .refine((n) => Number.isInteger(n) && n >= min && n <= max, {
      message: `נא להזין מספר שלם בין ${min} ל-${max}`,
    });

export const findSlotsFormSchema = z
  .object({
    startDate: z.string().min(1, 'נא לבחור תאריך התחלה'),
    endDate: z.string().min(1, 'נא לבחור תאריך סיום'),
    durationMinutes: intInRange(15, 8 * 60),
    workHourStart: intInRange(0, 23),
    workHourEnd: intInRange(1, 24),
  })
  .refine((d) => new Date(d.endDate) >= new Date(d.startDate), {
    message: 'תאריך הסיום חייב להיות אחרי או שווה לתאריך ההתחלה',
    path: ['endDate'],
  })
  .refine((d) => d.workHourEnd > d.workHourStart, {
    message: 'שעת הסיום חייבת להיות אחרי שעת ההתחלה',
    path: ['workHourEnd'],
  });
export type FindSlotsFormInput = z.input<typeof findSlotsFormSchema>;
export type FindSlotsFormOutput = z.output<typeof findSlotsFormSchema>;

export interface SlotsResponse {
  slots: Array<{ start: string; end: string }>;
  missingAvailability: Array<{ userId: string; name: string }>;
  memberCount: number;
}
