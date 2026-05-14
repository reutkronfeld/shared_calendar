import type { FastifyInstance } from 'fastify';
import { Types } from 'mongoose';
import { z } from 'zod';
import { MembershipModel } from '../groups/membership.model.js';
import { GroupModel, DEFAULT_CONSTRAINTS } from '../groups/group.model.js';
import { UserModel } from '../users/user.model.js';
import { AvailabilityOverrideModel } from '../availability/availability.model.js';
import {
  WeeklyAvailabilityModel,
  type DayAvailability,
} from '../availability/weekly.model.js';
import { fetchBusyForUser, type BusyInterval } from './freebusy.js';
import { findOverlappingFreeSlots } from './findSlots.js';
import { mergeOverridesIntoBusy } from './mergeOverrides.js';

const FindSlotsBody = z.object({
  rangeStart: z.string().datetime(),
  rangeEnd: z.string().datetime(),
  durationMinutes: z.number().int().min(15).max(8 * 60),
  timezone: z.string().min(1).default('Asia/Jerusalem'),
});

export default async function calendarRoutes(app: FastifyInstance): Promise<void> {
  app.post<{ Params: { id: string } }>(
    '/groups/:id/find-slots',
    { preHandler: [app.requireAuth] },
    async (req, reply) => {
      const { id } = req.params;
      if (!Types.ObjectId.isValid(id)) {
        return reply.code(400).send({ error: 'invalid_id' });
      }

      const parsed = FindSlotsBody.safeParse(req.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: 'invalid_body', issues: parsed.error.issues });
      }
      const body = parsed.data;

      const groupId = new Types.ObjectId(id);
      const userId = new Types.ObjectId(req.userId!);

      const membership = await MembershipModel.findOne({ groupId, userId });
      if (!membership) return reply.code(403).send({ error: 'not_a_member' });

      const group = await GroupModel.findById(groupId).lean();
      if (!group) return reply.code(404).send({ error: 'group_not_found' });

      const memberships = await MembershipModel.find({ groupId }).lean();
      const memberIds = memberships.map((m) => m.userId);
      const users = await UserModel.find({ _id: { $in: memberIds } }).lean();

      const rangeStart = new Date(body.rangeStart);
      const rangeEnd = new Date(body.rangeEnd);
      if (rangeEnd <= rangeStart) {
        return reply.code(400).send({ error: 'invalid_range' });
      }

      const overrides = await AvailabilityOverrideModel.find({
        userId: { $in: memberIds },
        // Any override whose interval overlaps the search range.
        start: { $lt: rangeEnd },
        end: { $gt: rangeStart },
      }).lean();
      const overridesByUser = new Map<string, typeof overrides>();
      for (const o of overrides) {
        const key = o.userId.toString();
        const list = overridesByUser.get(key) ?? [];
        list.push(o);
        overridesByUser.set(key, list);
      }

      const weeklyDocs = await WeeklyAvailabilityModel.find({
        userId: { $in: memberIds },
      }).lean();
      const weeklyByUser = new Map<string, DayAvailability[]>(
        weeklyDocs.map((w) => [w.userId.toString(), w.daysAvailability]),
      );

      const memberBusy: Array<BusyInterval[] | null> = [];
      const memberWeekly: Array<DayAvailability[] | null> = [];
      const missingAvailability: Array<{ userId: string; name: string }> = [];
      for (const u of users) {
        const uid = u._id.toString();
        memberWeekly.push(weeklyByUser.get(uid) ?? null);
        const userOverrides = overridesByUser.get(u._id.toString()) ?? [];
        if (!u.refreshToken) {
          if (userOverrides.length > 0) {
            // No Google data, but we can still respect manual busy overrides.
            const onlyBusy = userOverrides
              .filter((o) => o.type === 'busy')
              .map((o) => ({ start: o.start, end: o.end }));
            memberBusy.push(onlyBusy);
          } else {
            missingAvailability.push({ userId: u._id.toString(), name: u.name });
            memberBusy.push(null);
          }
          continue;
        }
        try {
          const googleBusy = await fetchBusyForUser(u.refreshToken, rangeStart, rangeEnd);
          const merged = mergeOverridesIntoBusy(googleBusy, userOverrides);
          memberBusy.push(merged);
        } catch (err) {
          req.log.warn({ err, userId: u._id.toString() }, 'freebusy_failed');
          if (userOverrides.length > 0) {
            const onlyBusy = userOverrides
              .filter((o) => o.type === 'busy')
              .map((o) => ({ start: o.start, end: o.end }));
            memberBusy.push(onlyBusy);
          } else {
            missingAvailability.push({ userId: u._id.toString(), name: u.name });
            memberBusy.push(null);
          }
        }
      }

      const slots = findOverlappingFreeSlots(memberBusy, {
        rangeStart,
        rangeEnd,
        durationMinutes: body.durationMinutes,
        timezone: body.timezone,
        constraints: group.constraints ?? DEFAULT_CONSTRAINTS,
        memberWeekly,
      });

      return reply.send({
        slots: slots.map((s) => ({
          start: s.start.toISOString(),
          end: s.end.toISOString(),
        })),
        missingAvailability,
        memberCount: users.length,
      });
    },
  );
}
