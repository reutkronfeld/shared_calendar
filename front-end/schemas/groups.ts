import { z } from 'zod';

export const createGroupSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'נא להזין שם קבוצה')
    .max(100, 'שם הקבוצה ארוך מדי (עד 100 תווים)'),
});
export type CreateGroupInput = z.infer<typeof createGroupSchema>;

export const joinGroupSchema = z.object({
  code: z
    .string()
    .trim()
    .min(3, 'הקוד קצר מדי')
    .max(60, 'הקוד ארוך מדי'),
});
export type JoinGroupInput = z.infer<typeof joinGroupSchema>;
