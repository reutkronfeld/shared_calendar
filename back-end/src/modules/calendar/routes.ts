import type { FastifyInstance } from 'fastify';
import { Types } from 'mongoose';
import { z } from 'zod';
import { MembershipModel } from '../groups/membership.model.js';
import { GroupModel, DEFAULT_CONSTRAINTS } from '../groups/group.model.js';
import { UserModel } from '../users/user.model.js';
import { AvailabilityOverrideModel } from '../availability/availability.model.js';
import { fetchEventsForUser, type CalEvent } from './events.js';
import { classifyEvents } from './classifier.js';
import { geocode } from './geocode.js';
import {
  findOverlappingFreeSlotsRich,
  type ClassifiedEvent,
  type RichMember,
} from './findSlotsRich.js';

const FindSlotsBody = z.object({
  rangeStart: z.string().datetime(),
  rangeEnd: z.string().datetime(),
  durationMinutes: z.number().int().min(15).max(8 * 60),
  timezone: z.string().min(1).default('Asia/Jerusalem'),
  meetingLocation: z.string().trim().max(200).optional(),
});

export default async function calendarRoutes(app: FastifyInstance): Promise<void> {
  app.post<{ Params: { id: string } }>(
    '/groups/:id/find-slots',
    { preHandler: [app.requireAuth] },
    async (req, reply) => {
      const log = req.log.child({ route: 'find_slots', groupId: req.params.id });
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

      // Resolve the meeting location once. Null means "online / unknown" — no
      // travel buffer will be applied.
      const meetingLatLng = body.meetingLocation ? await geocode(body.meetingLocation) : null;

      const overrides = await AvailabilityOverrideModel.find({
        userId: { $in: memberIds },
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

      // 1) Fetch events for each user (parallel) and apply free/busy overrides.
      const fetchResults = await Promise.all(
        users.map(async (u) => {
          if (!u.refreshToken) {
            return { user: u, events: null as CalEvent[] | null };
          }
          try {
            const events = await fetchEventsForUser(u.refreshToken, rangeStart, rangeEnd);
            return { user: u, events };
          } catch (err) {
            log.warn({ err, userId: u._id.toString() }, 'fetch_events_failed');
            return { user: u, events: null as CalEvent[] | null };
          }
        }),
      );

      // Inject manual "busy" overrides as synthetic events (no location).
      for (const r of fetchResults) {
        const userOverrides = overridesByUser.get(r.user._id.toString()) ?? [];
        const busyOv = userOverrides
          .filter((o) => o.type === 'busy')
          .map(
            (o): CalEvent => ({
              id: `override-${o._id.toString()}`,
              start: o.start,
              end: o.end,
              summary: o.note ?? 'חסום ידנית',
              location: null,
            }),
          );
        if (r.events === null && busyOv.length > 0) {
          r.events = busyOv;
        } else if (r.events !== null && busyOv.length > 0) {
          r.events = [...r.events, ...busyOv];
        }
      }

      // 2) Classify all events across all members in a single batch (cheaper
      // and faster — gpt-4o-mini call only happens for unknown titles).
      const allEvents: CalEvent[] = [];
      const eventOrigin: number[] = []; // index into fetchResults
      fetchResults.forEach((r, i) => {
        if (!r.events) return;
        for (const e of r.events) {
          allEvents.push(e);
          eventOrigin.push(i);
        }
      });

      const importanceList = await classifyEvents(allEvents.map((e) => e.summary));

      // 3) Geocode all distinct locations (cached). Run in parallel; failures
      // become null and just skip travel calc.
      const locations = Array.from(
        new Set(allEvents.map((e) => e.location).filter((l): l is string => !!l)),
      );
      const geoMap = new Map<string, Awaited<ReturnType<typeof geocode>>>();
      await Promise.all(
        locations.map(async (loc) => {
          geoMap.set(loc, await geocode(loc));
        }),
      );

      // 4) Build per-member rich event lists.
      const richMembers: RichMember[] = fetchResults.map((r) => ({
        userId: r.user._id.toString(),
        name: r.user.name,
        events: r.events === null ? null : [],
      }));
      for (let i = 0; i < allEvents.length; i += 1) {
        const ev = allEvents[i]!;
        const memberIdx = eventOrigin[i]!;
        const rich: ClassifiedEvent = {
          ...ev,
          importance: importanceList[i] ?? 'movable',
          latLng: ev.location ? geoMap.get(ev.location) ?? null : null,
        };
        richMembers[memberIdx]!.events!.push(rich);
      }

      const missingAvailability = richMembers
        .filter((m) => m.events === null)
        .map((m) => ({ userId: m.userId, name: m.name }));

      // 5) Run the slot finder.
      const { slots, nearMisses } = findOverlappingFreeSlotsRich(richMembers, {
        rangeStart,
        rangeEnd,
        durationMinutes: body.durationMinutes,
        timezone: body.timezone,
        constraints: group.constraints ?? DEFAULT_CONSTRAINTS,
        meetingLocation: meetingLatLng,
      });

      log.info(
        {
          eventCount: allEvents.length,
          memberCount: users.length,
          missingCount: missingAvailability.length,
          slotCount: slots.length,
          nearMissCount: nearMisses.length,
          locationResolved: !!meetingLatLng,
        },
        'find_slots_done',
      );

      return reply.send({
        slots: slots.map((s) => ({
          start: s.start.toISOString(),
          end: s.end.toISOString(),
        })),
        nearMisses: nearMisses.map((nm) => ({
          slotStart: nm.slotStart.toISOString(),
          slotEnd: nm.slotEnd.toISOString(),
          movableBlockers: nm.movableBlockers.map((b) => ({
            memberId: b.memberId,
            memberName: b.memberName,
            eventId: b.eventId,
            summary: b.summary,
            start: b.start.toISOString(),
            end: b.end.toISOString(),
          })),
        })),
        missingAvailability,
        memberCount: users.length,
        meetingLocationResolved: !!meetingLatLng,
      });
    },
  );
}
