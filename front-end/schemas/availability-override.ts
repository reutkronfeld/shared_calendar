import { z } from 'zod';

export const overrideFormSchema = z
  .object({
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'נא לבחור תאריך'),
    startTime: z.string().regex(/^\d{2}:\d{2}$/, 'שעת התחלה לא תקינה'),
    endTime: z.string().regex(/^\d{2}:\d{2}$/, 'שעת סיום לא תקינה'),
    type: z.enum(['busy', 'free']),
    note: z.string().trim().max(200).optional(),
  })
  .refine((d) => d.endTime > d.startTime, {
    message: 'שעת הסיום חייבת להיות אחרי שעת ההתחלה',
    path: ['endTime'],
  });

export type OverrideFormInput = z.infer<typeof overrideFormSchema>;
