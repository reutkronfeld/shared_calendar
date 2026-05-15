import type { FastifyInstance } from 'fastify';
import { Types } from 'mongoose';
import { z } from 'zod';
import { MembershipModel } from '../groups/membership.model.js';
import { GroupModel, DEFAULT_CONSTRAINTS } from '../groups/group.model.js';
import { UserModel } from '../users/user.model.js';
import { AvailabilityOverrideModel } from '../availability/availability.model.js';
import { WeeklyAvailabilityModel, type DayAvailability } from '../availability/weekly.model.js';
import { fetchEventsForUser, insertEventForUser, type CalEvent } from './events.js';
import { classifyEvents } from './classifier.js';
import { geocode } from './geocode.js';
import {
  findOverlappingFreeSlotsRich,
  type ClassifiedEvent,
  type RichMember,
} from './findSlotsRich.js';
import { NegotiationSessionModel } from '../groups/negotiation.model.js';
import { sendNegotiationEmail } from '../../lib/resend.js';
import { env } from '../../config/env.js';

const FindSlotsBody = z.object({
  rangeStart: z.string().datetime(),
  rangeEnd: z.string().datetime(),
  durationMinutes: z.number().int().min(15).max(8 * 60),
  timezone: z.string().min(1).default('Asia/Jerusalem'),
  meetingLocation: z.string().trim().max(200).optional(),
});

const ScheduleBody = z.object({
  title: z.string().min(1).max(100),
  rangeStart: z.string().datetime(),
  rangeEnd: z.string().datetime(),
  durationMinutes: z.number().int().min(15).max(8 * 60),
  timezone: z.string().min(1).default('Asia/Jerusalem'),
  meetingLocation: z.string().trim().max(200).optional(),
});

export default async function calendarRoutes(app: FastifyInstance): Promise<void> {
  app.get<{ Params: { id: string } }>(
    '/negotiate/:id',
    { preHandler: [app.requireAuth] },
    async (req, reply) => {
      const { id } = req.params;
      if (!Types.ObjectId.isValid(id)) return reply.code(400).send({ error: 'invalid_id' });

      const session = await NegotiationSessionModel.findById(id).lean();
      if (!session) return reply.code(404).send({ error: 'session_not_found' });

      const userId = req.userId!;
      const isMember = session.pendingMembers.some(m => m.userId.toString() === userId);
      const isCreator = session.creatorId.toString() === userId;

      if (!isMember && !isCreator) return reply.code(403).send({ error: 'unauthorized' });

      return reply.send(session);
    },
  );

  app.post<{ Body: { eventId: string; start: string; end: string } }>(
    '/calendar/move-event',
    { preHandler: [app.requireAuth] },
    async (req, reply) => {
      const { eventId, start, end } = req.body;
      const userId = new Types.ObjectId(req.userId!);
      const user = await UserModel.findById(userId);
      if (!user || !user.refreshToken) return reply.code(400).send({ error: 'no_refresh_token' });

      const refreshToken = decrypt(user.refreshToken);
      const oauth2 = new google.auth.OAuth2(
        env.GOOGLE_CLIENT_ID,
        env.GOOGLE_CLIENT_SECRET,
        env.GOOGLE_REDIRECT_URI,
      );
      oauth2.setCredentials({ refresh_token: refreshToken });
      const calendar = google.calendar({ version: 'v3', auth: oauth2 });

      try {
        await calendar.events.patch({
          calendarId: 'primary',
          eventId,
          requestBody: {
            start: { dateTime: new Date(start).toISOString() },
            end: { dateTime: new Date(end).toISOString() },
          },
        });
        return { ok: true };
      } catch (err) {
        req.log.error({ err, eventId }, 'failed_to_move_event');
        return reply.code(500).send({ error: 'failed_to_move_event' });
      }
    },
  );

  app.post<{ Params: { id: string } }>(
    '/negotiate/:id/finalize',
    { preHandler: [app.requireAuth] },
    async (req, reply) => {
      const { id } = req.params;
      if (!Types.ObjectId.isValid(id)) return reply.code(400).send({ error: 'invalid_id' });

      const session = await NegotiationSessionModel.findById(id);
      if (!session || session.status !== 'active') return reply.code(404).send({ error: 'session_not_found_or_inactive' });

      // In a real app, we'd check if ALL blockers are resolved. 
      // For now, if the person who was redirected here resolves it, we can try to finalize.
      
      const group = await GroupModel.findById(session.groupId).lean();
      if (!group) return reply.code(404).send({ error: 'group_not_found' });

      const memberships = await MembershipModel.find({ groupId: session.groupId }).lean();
      const memberIds = memberships.map((m) => m.userId);
      const users = await UserModel.find({ _id: { $in: memberIds } }).lean();

      const insertPromises = users.map(async (u) => {
        if (!u.refreshToken) return;
        return insertEventForUser(u.refreshToken, {
          start: session.slotStart,
          end: session.slotEnd,
          summary: session.title,
          location: session.location,
          description: `Group meeting for ${group.name} (Negotiated)`,
        });
      });

      await Promise.all(insertPromises);

      session.status = 'completed';
      await session.save();

      return { ok: true };
    },
  );

  app.post<{ Params: { id: string } }>(
    '/negotiate/:id/reject',
    { preHandler: [app.requireAuth] },
    async (req, reply) => {
      const log = req.log.child({ route: 'reject_negotiation', sessionId: req.params.id });
      const { id } = req.params;
      if (!Types.ObjectId.isValid(id)) return reply.code(400).send({ error: 'invalid_id' });

      const session = await NegotiationSessionModel.findById(id);
      if (!session || session.status !== 'active') return reply.code(404).send({ error: 'session_not_found_or_inactive' });

      // 1. Mark current session as failed
      session.status = 'failed';
      await session.save();

      // 2. Re-run scheduling logic to find NEXT best slot
      // For brevity in this prototype, we'll re-implement the search but skip the rejected slot.
      const groupId = session.groupId;
      const group = await GroupModel.findById(groupId).lean();
      if (!group) return reply.code(404).send({ error: 'group_not_found' });

      const memberships = await MembershipModel.find({ groupId }).lean();
      const memberIds = memberships.map((m) => m.userId);
      const users = await UserModel.find({ _id: { $in: memberIds } }).lean();

      // We need to know the original search range. We'll use a heuristic or just look 7 days ahead from now.
      // Better: In a real app, we'd store the original search params in the session.
      // Since we didn't add range to session, we'll assume a 7-day range from the original slot.
      const rangeStart = new Date();
      const rangeEnd = new Date(session.slotStart.getTime() + 7 * 24 * 60 * 60 * 1000);

      const fetchResults = await Promise.all(
        users.map(async (u) => {
          if (!u.refreshToken) return { user: u, events: null as CalEvent[] | null };
          try {
            const events = await fetchEventsForUser(u.refreshToken, rangeStart, rangeEnd);
            log.info({ userId: u._id.toString(), eventCount: events.length, eventTitles: events.map(e => e.summary) }, 'events_fetched_for_user_reject');
            return { user: u, events };
          } catch (err) {
            return { user: u, events: null };
          }
        }),
      );

      // (Simplified assembling logic)
      const weeklyDocs = await WeeklyAvailabilityModel.find({ userId: { $in: memberIds } }).lean();
      const weeklyByUser = new Map(weeklyDocs.map((w) => [w.userId.toString(), w.daysAvailability]));
      
      const richMembers: RichMember[] = fetchResults.map((r) => ({
        userId: r.user._id.toString(),
        name: r.user.name,
        events: (r.events || []).map(e => ({ ...e, importance: 'movable' as const, latLng: null })),
        weekly: weeklyByUser.get(r.user._id.toString()) ?? null,
      }));

      const { slots, nearMisses } = findOverlappingFreeSlotsRich(richMembers, {
        rangeStart,
        rangeEnd,
        durationMinutes: session.durationMinutes,
        timezone: 'Asia/Jerusalem',
        constraints: group.constraints ?? DEFAULT_CONSTRAINTS,
        meetingLocation: null,
      });

      // 3. Filter out the rejected slot
      const otherSlots = slots.filter(s => s.start.getTime() !== session.slotStart.getTime());
      const otherNearMisses = nearMisses.filter(nm => nm.slotStart.getTime() !== session.slotStart.getTime());

      if (otherSlots.length > 0) {
        const bestSlot = otherSlots[0]!;
        await Promise.all(users.map(async (u) => {
          if (!u.refreshToken) return;
          return insertEventForUser(u.refreshToken, {
            start: bestSlot.start, end: bestSlot.end, summary: session.title,
          });
        }));
        return { status: 'scheduled', slot: bestSlot };
      }

      if (otherNearMisses.length > 0) {
        const bestNM = otherNearMisses[0]!;
        const newSession = await NegotiationSessionModel.create({
          groupId,
          creatorId: session.creatorId,
          title: session.title,
          slotStart: bestNM.slotStart,
          slotEnd: bestNM.slotEnd,
          durationMinutes: session.durationMinutes,
          pendingMembers: bestNM.movableBlockers.map(b => ({
            userId: new Types.ObjectId(b.memberId),
            eventId: b.eventId,
            summary: b.summary,
            originalStart: b.start,
            originalEnd: b.end,
          })),
        });

        // Send new emails
        for (const b of bestNM.movableBlockers) {
          const user = users.find(u => u._id.toString() === b.memberId);
          if (user?.email) {
            await sendNegotiationEmail({
              to: user.email,
              userName: user.name,
              groupName: group.name,
              meetingTitle: session.title,
              meetingTime: bestNM.slotStart.toLocaleString('he-IL'),
              negotiationUrl: `${env.FRONTEND_URL}/negotiate/${newSession._id.toString()}`,
            });
          }
        }
        return { status: 'negotiating', sessionId: newSession._id };
      }

      return reply.code(404).send({ error: 'no_more_options' });
    },
  );

  app.post<{ Params: { id: string } }>(
    '/groups/:id/schedule',
    { preHandler: [app.requireAuth] },
    async (req, reply) => {
      const log = req.log.child({ route: 'schedule', groupId: req.params.id });
      const { id } = req.params;
      if (!Types.ObjectId.isValid(id)) return reply.code(400).send({ error: 'invalid_id' });

      const parsed = ScheduleBody.safeParse(req.body);
      if (!parsed.success) return reply.code(400).send({ error: 'invalid_body', issues: parsed.error.issues });
      const body = parsed.data;

      const groupId = new Types.ObjectId(id);
      const userId = new Types.ObjectId(req.userId!);

      const group = await GroupModel.findById(groupId).lean();
      if (!group) return reply.code(404).send({ error: 'group_not_found' });

      const memberships = await MembershipModel.find({ groupId }).lean();
      const memberIds = memberships.map((m) => m.userId);
      const users = await UserModel.find({ _id: { $in: memberIds } }).lean();

      // --- 1. Find Slots (Same logic as /find-slots) ---
      const rangeStart = new Date(body.rangeStart);
      const rangeEnd = new Date(body.rangeEnd);
      const meetingLatLng = body.meetingLocation ? await geocode(body.meetingLocation) : null;

      const weeklyDocs = await WeeklyAvailabilityModel.find({ userId: { $in: memberIds } }).lean();
      const weeklyByUser = new Map(weeklyDocs.map((w) => [w.userId.toString(), w.daysAvailability]));

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

      const fetchResults = await Promise.all(
        users.map(async (u) => {
          if (!u.refreshToken) return { user: u, events: null as CalEvent[] | null };
          try {
            const events = await fetchEventsForUser(u.refreshToken, rangeStart, rangeEnd);
            log.info({ userId: u._id.toString(), eventCount: events.length, eventTitles: events.map(e => e.summary) }, 'events_fetched_for_user_schedule');
            return { user: u, events };
          } catch (err) {
            log.warn({ err, userId: u._id.toString() }, 'fetch_events_failed');
            return { user: u, events: null as CalEvent[] | null };
          }
        }),
      );

      for (const r of fetchResults) {
        const userOverrides = overridesByUser.get(r.user._id.toString()) ?? [];
        const busyOv = userOverrides
          .filter((o) => o.type === 'busy')
          .map((o): CalEvent => ({
            id: `override-${o._id.toString()}`,
            start: o.start,
            end: o.end,
            summary: o.note ?? 'חסום ידנית',
            location: null,
          }));
        if (r.events === null && busyOv.length > 0) r.events = busyOv;
        else if (r.events !== null && busyOv.length > 0) r.events = [...r.events, ...busyOv];
      }

      const allEvents: CalEvent[] = [];
      const eventOrigin: number[] = [];
      fetchResults.forEach((r, i) => {
        if (!r.events) return;
        for (const e of r.events) {
          allEvents.push(e);
          eventOrigin.push(i);
        }
      });
      const importanceList = await classifyEvents(allEvents.map((e) => e.summary));

      const locations = Array.from(new Set(allEvents.map((e) => e.location).filter((l): l is string => !!l)));
      const geoMap = new Map<string, Awaited<ReturnType<typeof geocode>>>();
      await Promise.all(locations.map(async (loc) => geoMap.set(loc, await geocode(loc))));

      const richMembers: RichMember[] = fetchResults.map((r) => ({
        userId: r.user._id.toString(),
        name: r.user.name,
        events: r.events === null ? null : [],
        weekly: weeklyByUser.get(r.user._id.toString()) ?? null,
      }));
      for (let i = 0; i < allEvents.length; i += 1) {
        const ev = allEvents[i]!;
        const memberIdx = eventOrigin[i]!;
        const isOverride = ev.id.startsWith('override-');
        const rich: ClassifiedEvent = {
          ...ev,
          importance: isOverride ? 'critical' : importanceList[i] ?? 'movable',
          latLng: ev.location ? geoMap.get(ev.location) ?? null : null,
        };
        richMembers[memberIdx]!.events!.push(rich);
      }

      const { slots, nearMisses } = findOverlappingFreeSlotsRich(richMembers, {
        rangeStart,
        rangeEnd,
        durationMinutes: body.durationMinutes,
        timezone: body.timezone,
        constraints: group.constraints ?? DEFAULT_CONSTRAINTS,
        meetingLocation: meetingLatLng,
      });

      // --- 2. Action Logic ---
      if (slots.length > 0) {
        // Option A: Perfect match found. Pick the first one and schedule.
        const bestSlot = slots[0]!;
        log.info({ slot: bestSlot }, 'perfect_slot_found_scheduling');

        const insertPromises = users.map(async (u) => {
          if (!u.refreshToken) return;
          return insertEventForUser(u.refreshToken, {
            start: bestSlot.start,
            end: bestSlot.end,
            summary: body.title,
            location: body.meetingLocation,
            description: `Group meeting for ${group.name}`,
          });
        });

        await Promise.all(insertPromises);
        return reply.send({ status: 'scheduled', slot: bestSlot });
      }

      if (nearMisses.length > 0) {
        // Option B: No perfect match, but we have near misses. Initiate negotiation.
        // Pick the best near miss (fewest blockers).
        const bestNM = nearMisses.reduce((prev, curr) => 
          curr.movableBlockers.length < prev.movableBlockers.length ? curr : prev
        );

        log.info({ nearMiss: bestNM }, 'near_miss_found_initiating_negotiation');

        const session = await NegotiationSessionModel.create({
          groupId,
          creatorId: userId,
          title: body.title,
          slotStart: bestNM.slotStart,
          slotEnd: bestNM.slotEnd,
          durationMinutes: body.durationMinutes,
          location: body.meetingLocation,
          pendingMembers: bestNM.movableBlockers.map(b => ({
            userId: new Types.ObjectId(b.memberId),
            eventId: b.eventId,
            summary: b.summary,
            originalStart: b.start,
            originalEnd: b.end,
          })),
        });

        // Send emails in background
        const emailPromises = bestNM.movableBlockers.map(async (b) => {
          const user = users.find(u => u._id.toString() === b.memberId);
          if (!user || !user.email) return;

          const meetingTimeStr = new Intl.DateTimeFormat('he-IL', {
            weekday: 'long',
            day: 'numeric',
            month: 'long',
            hour: '2-digit',
            minute: '2-digit',
          }).format(bestNM.slotStart);

          const negotiationUrl = `${env.FRONTEND_URL}/negotiate/${session._id.toString()}`;

          return sendNegotiationEmail({
            to: user.email,
            userName: user.name,
            groupName: group.name,
            meetingTitle: body.title,
            meetingTime: meetingTimeStr,
            negotiationUrl,
          });
        });

        // We don't wait for emails to finish before replying to user
        Promise.all(emailPromises).catch(err => log.error({ err }, 'failed_to_send_negotiation_emails'));

        return reply.send({ 
          status: 'negotiating', 
          sessionId: session._id,
          blockerCount: bestNM.movableBlockers.length 
        });
      }

      return reply.code(404).send({ error: 'no_slots_available' });
    },
  );

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

      const meetingLatLng = body.meetingLocation ? await geocode(body.meetingLocation) : null;

      const weeklyDocs = await WeeklyAvailabilityModel.find({
        userId: { $in: memberIds },
      }).lean();
      const weeklyByUser = new Map<string, DayAvailability[]>(
        weeklyDocs.map((w) => [w.userId.toString(), w.daysAvailability]),
      );

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

      // 1) Pull events for each user in parallel.
      const fetchResults = await Promise.all(
        users.map(async (u) => {
          if (!u.refreshToken) return { user: u, events: null as CalEvent[] | null };
          try {
            const events = await fetchEventsForUser(u.refreshToken, rangeStart, rangeEnd);
            log.info({ userId: u._id.toString(), eventCount: events.length, eventTitles: events.map(e => e.summary) }, 'events_fetched_for_user');
            return { user: u, events };
          } catch (err) {
            log.warn({ err, userId: u._id.toString() }, 'fetch_events_failed');
            return { user: u, events: null as CalEvent[] | null };
          }
        }),
      );

      // Manual "busy" overrides become synthetic events (no location). They're
      // later marked critical (user said so explicitly).
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

      // 2) Classify all events in one batch (gpt-4o-mini only hit for unknowns).
      const allEvents: CalEvent[] = [];
      const eventOrigin: number[] = [];
      fetchResults.forEach((r, i) => {
        if (!r.events) return;
        for (const e of r.events) {
          allEvents.push(e);
          eventOrigin.push(i);
        }
      });
      const importanceList = await classifyEvents(allEvents.map((e) => e.summary));

      // 3) Geocode every distinct event location (cached in Mongo).
      const locations = Array.from(
        new Set(allEvents.map((e) => e.location).filter((l): l is string => !!l)),
      );
      const geoMap = new Map<string, Awaited<ReturnType<typeof geocode>>>();
      await Promise.all(
        locations.map(async (loc) => {
          geoMap.set(loc, await geocode(loc));
        }),
      );

      // 4) Assemble rich members.
      const richMembers: RichMember[] = fetchResults.map((r) => ({
        userId: r.user._id.toString(),
        name: r.user.name,
        events: r.events === null ? null : [],
        weekly: weeklyByUser.get(r.user._id.toString()) ?? null,
      }));
      for (let i = 0; i < allEvents.length; i += 1) {
        const ev = allEvents[i]!;
        const memberIdx = eventOrigin[i]!;
        const isOverride = ev.id.startsWith('override-');
        const rich: ClassifiedEvent = {
          ...ev,
          importance: isOverride ? 'critical' : importanceList[i] ?? 'movable',
          latLng: ev.location ? geoMap.get(ev.location) ?? null : null,
        };
        richMembers[memberIdx]!.events!.push(rich);
      }

      const missingAvailability = richMembers
        .filter((m) => m.events === null)
        .map((m) => ({ userId: m.userId, name: m.name }));

      // 5) Run the location-aware slot finder.
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
