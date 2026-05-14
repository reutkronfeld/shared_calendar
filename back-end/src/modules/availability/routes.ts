import type { FastifyInstance } from 'fastify';
import { Types } from 'mongoose';
import { z } from 'zod';
import { AvailabilityOverrideModel } from './availability.model.js';
import { WeeklyAvailabilityModel, DEFAULT_DAYS } from './weekly.model.js';

const CreateBody = z.object({
  start: z.string().datetime(),
  end: z.string().datetime(),
  type: z.enum(['busy', 'free']),
  note: z.string().trim().max(200).optional(),
});

const WeeklyBody = z.object({
  daysAvailability: z
    .array(
      z.object({
        day: z.number().int().min(0).max(6),
        enabled: z.boolean(),
        timeRanges: z
          .array(
            z.object({
              startMinute: z.number().int().min(0).max(1439),
              endMinute: z.number().int().min(1).max(1440),
            }),
          )
          .max(6),
      }),
    )
    .length(7),
});

export default async function availabilityRoutes(app: FastifyInstance): Promise<void> {
  app.get('/me/overrides', { preHandler: [app.requireAuth] }, async (req) => {
    const userId = new Types.ObjectId(req.userId!);
    const overrides = await AvailabilityOverrideModel.find({ userId })
      .sort({ start: 1 })
      .lean();
    return overrides.map((o) => ({
      id: o._id.toString(),
      start: o.start.toISOString(),
      end: o.end.toISOString(),
      type: o.type,
      note: o.note ?? null,
    }));
  });

  app.post('/me/overrides', { preHandler: [app.requireAuth] }, async (req, reply) => {
    const parsed = CreateBody.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'invalid_body', issues: parsed.error.issues });
    }
    const { start, end, type, note } = parsed.data;
    const startDate = new Date(start);
    const endDate = new Date(end);
    if (endDate <= startDate) {
      return reply.code(400).send({ error: 'invalid_range' });
    }
    const userId = new Types.ObjectId(req.userId!);
    const doc = await AvailabilityOverrideModel.create({
      userId,
      start: startDate,
      end: endDate,
      type,
      note,
    });
    return reply.code(201).send({
      id: doc._id.toString(),
      start: doc.start.toISOString(),
      end: doc.end.toISOString(),
      type: doc.type,
      note: doc.note ?? null,
    });
  });

  app.delete<{ Params: { id: string } }>(
    '/me/overrides/:id',
    { preHandler: [app.requireAuth] },
    async (req, reply) => {
      if (!Types.ObjectId.isValid(req.params.id)) {
        return reply.code(400).send({ error: 'invalid_id' });
      }
      const userId = new Types.ObjectId(req.userId!);
      const overrideId = new Types.ObjectId(req.params.id);
      const result = await AvailabilityOverrideModel.deleteOne({ _id: overrideId, userId });
      if (result.deletedCount === 0) {
        return reply.code(404).send({ error: 'not_found' });
      }
      return reply.code(204).send();
    },
  );

  app.get('/me/weekly-availability', { preHandler: [app.requireAuth] }, async (req) => {
    const userId = new Types.ObjectId(req.userId!);
    const doc = await WeeklyAvailabilityModel.findOne({ userId }).lean();
    return { daysAvailability: doc?.daysAvailability ?? DEFAULT_DAYS };
  });

  app.put('/me/weekly-availability', { preHandler: [app.requireAuth] }, async (req, reply) => {
    const log = req.log.child({ route: 'weekly_availability_put', userId: req.userId });
    log.info({ body: req.body }, 'weekly_request_received');

    const parsed = WeeklyBody.safeParse(req.body);
    if (!parsed.success) {
      log.warn({ issues: parsed.error.issues }, 'weekly_invalid_body');
      return reply.code(400).send({ error: 'invalid_body', issues: parsed.error.issues });
    }
    for (const d of parsed.data.daysAvailability) {
      for (const r of d.timeRanges) {
        if (r.endMinute <= r.startMinute) {
          log.warn({ day: d.day, range: r }, 'weekly_invalid_range');
          return reply.code(400).send({ error: 'invalid_range', day: d.day });
        }
      }
    }
    try {
      const userId = new Types.ObjectId(req.userId!);
      const updated = await WeeklyAvailabilityModel.findOneAndUpdate(
        { userId },
        { $set: { daysAvailability: parsed.data.daysAvailability } },
        { new: true, upsert: true },
      ).lean();
      log.info('weekly_saved');
      return { daysAvailability: updated!.daysAvailability };
    } catch (err) {
      log.error({ err }, 'weekly_save_failed');
      return reply.code(500).send({ error: 'save_failed' });
    }
  });
}
