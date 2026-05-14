import { tool } from 'ai';
import { Types } from 'mongoose';
import { z } from 'zod';
import * as groupService from '../groups/group.service.js';
import { GroupModel, DEFAULT_CONSTRAINTS } from '../groups/group.model.js';
import { MembershipModel } from '../groups/membership.model.js';
import { UserModel } from '../users/user.model.js';
import { fetchBusyForUser, type BusyInterval } from '../calendar/freebusy.js';
import { findOverlappingFreeSlots } from '../calendar/findSlots.js';

/**
 * Tools are built per-request with the user/group bound in closure, so the
 * model never has to (and cannot) supply userId/groupId itself.
 */
export function buildChatTools(opts: { userId: string; groupId: string }) {
  const { userId, groupId } = opts;

  return {
    get_group_detail: tool({
      description:
        'מחזיר את פרטי הקבוצה הנוכחית: שם, קוד, חברים (שם, מייל, תפקיד), והאילוצים הקבועים. השתמש כשהמשתמש שואל על הקבוצה, החברים, או רוצה לדעת מה האילוצים הנוכחיים.',
      inputSchema: z.object({}),
      execute: async () => {
        const detail = await groupService.getGroupDetail(userId, groupId);
        return {
          id: detail.id,
          name: detail.name,
          code: detail.code,
          organizerId: detail.organizerId,
          members: detail.members.map((m) => ({
            userId: m.userId,
            name: m.name,
            email: m.email,
            role: m.role,
          })),
          constraints: detail.constraints,
        };
      },
    }),

    update_constraints: tool({
      description:
        'מעדכן את האילוצים של הקבוצה (ימים מוחרגים, שעות פעילות, הפסקת צהריים, באפר וכו׳). חשוב מאוד: לפני קריאה, תאר למשתמש בעברית את השינוי המדויק ובקש אישור בטקסט ("האם לשמור?"). הפעל את הכלי רק אחרי שהמשתמש אישר במפורש.',
      inputSchema: z.object({
        excludedWeekdays: z
          .array(z.number().int().min(0).max(6))
          .max(7)
          .optional()
          .describe('ימים מוחרגים: 0=ראשון … 6=שבת'),
        noEarlierThan: z
          .number()
          .int()
          .min(0)
          .max(1439)
          .optional()
          .describe('דקה מוקדמת ביותר ביום (0–1439). למשל 9:00 = 540'),
        noLaterThan: z
          .number()
          .int()
          .min(1)
          .max(1440)
          .optional()
          .describe('דקה מאוחרת ביותר ביום (1–1440). למשל 20:00 = 1200'),
        lunchBreak: z
          .object({
            enabled: z.boolean(),
            startMinute: z.number().int().min(0).max(1439),
            endMinute: z.number().int().min(1).max(1440),
          })
          .optional(),
        bufferMinutes: z.number().int().min(0).max(240).optional(),
        minNoticeHours: z
          .number()
          .int()
          .min(0)
          .max(24 * 14)
          .optional(),
        excludedDates: z
          .array(z.string().regex(/^\d{4}-\d{2}-\d{2}$/))
          .max(365)
          .optional()
          .describe('תאריכים בפורמט YYYY-MM-DD'),
      }),
      execute: async (patch: Parameters<typeof groupService.updateConstraints>[2]) => {
        const updated = await groupService.updateConstraints(userId, groupId, patch);
        return { ok: true, constraints: updated };
      },
    }),

    find_slots: tool({
      description:
        'מוצא זמני פגישה משותפים פנויים לכל חברי הקבוצה בטווח תאריכים נתון, לפי האילוצים. השתמש כשהמשתמש מבקש זמנים פנויים. ה־timezone הוא Asia/Jerusalem אלא אם נאמר אחרת.',
      inputSchema: z.object({
        rangeStart: z
          .string()
          .datetime()
          .describe('תחילת הטווח כ־ISO 8601 (UTC). למשל 2026-05-14T00:00:00Z'),
        rangeEnd: z
          .string()
          .datetime()
          .describe('סוף הטווח כ־ISO 8601 (UTC)'),
        durationMinutes: z
          .number()
          .int()
          .min(15)
          .max(8 * 60)
          .describe('משך הפגישה בדקות'),
        timezone: z.string().default('Asia/Jerusalem'),
      }),
      execute: async ({
        rangeStart,
        rangeEnd,
        durationMinutes,
        timezone,
      }: {
        rangeStart: string;
        rangeEnd: string;
        durationMinutes: number;
        timezone: string;
      }) => {
        if (!Types.ObjectId.isValid(groupId)) {
          return { error: 'invalid_group_id' };
        }
        const gid = new Types.ObjectId(groupId);
        const uid = new Types.ObjectId(userId);

        const membership = await MembershipModel.findOne({ groupId: gid, userId: uid });
        if (!membership) return { error: 'not_a_member' };

        const group = await GroupModel.findById(gid).lean();
        if (!group) return { error: 'group_not_found' };

        const start = new Date(rangeStart);
        const end = new Date(rangeEnd);
        if (end <= start) return { error: 'invalid_range' };

        const memberships = await MembershipModel.find({ groupId: gid }).lean();
        const users = await UserModel.find({
          _id: { $in: memberships.map((m) => m.userId) },
        }).lean();

        const memberBusy: Array<BusyInterval[] | null> = [];
        const missing: Array<{ userId: string; name: string }> = [];
        for (const u of users) {
          if (!u.refreshToken) {
            missing.push({ userId: u._id.toString(), name: u.name });
            memberBusy.push(null);
            continue;
          }
          try {
            memberBusy.push(await fetchBusyForUser(u.refreshToken, start, end));
          } catch {
            missing.push({ userId: u._id.toString(), name: u.name });
            memberBusy.push(null);
          }
        }

        const slots = findOverlappingFreeSlots(memberBusy, {
          rangeStart: start,
          rangeEnd: end,
          durationMinutes,
          timezone,
          constraints: group.constraints ?? DEFAULT_CONSTRAINTS,
        });

        return {
          slots: slots.map((s) => ({
            start: s.start.toISOString(),
            end: s.end.toISOString(),
          })),
          missingAvailability: missing,
          memberCount: users.length,
        };
      },
    }),
  };
}
