import type { FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import * as groupService from './group.service.js';
import { ServiceError } from './group.service.js';

const CreateGroupBody = z.object({
  name: z.string().trim().min(1).max(100),
});

const JoinGroupBody = z.object({
  code: z.string().min(3).max(60),
});

const ConstraintsBody = z.object({
  excludedWeekdays: z.array(z.number().int().min(0).max(6)).max(7).optional(),
  noEarlierThan: z.number().int().min(0).max(1439).optional(),
  noLaterThan: z.number().int().min(1).max(1440).optional(),
  lunchBreak: z
    .object({
      enabled: z.boolean(),
      startMinute: z.number().int().min(0).max(1439),
      endMinute: z.number().int().min(1).max(1440),
    })
    .optional(),
  bufferMinutes: z.number().int().min(0).max(240).optional(),
  minNoticeHours: z.number().int().min(0).max(24 * 14).optional(),
  excludedDates: z
    .array(z.string().regex(/^\d{4}-\d{2}-\d{2}$/))
    .max(365)
    .optional(),
});

function handleServiceError(reply: FastifyReply, err: unknown): FastifyReply {
  if (err instanceof ServiceError) {
    return reply.code(err.status).send({ error: err.code });
  }
  throw err;
}

export async function createGroupHandler(
  req: FastifyRequest,
  reply: FastifyReply,
): Promise<FastifyReply> {
  const parsed = CreateGroupBody.safeParse(req.body);
  if (!parsed.success) {
    return reply.code(400).send({ error: 'invalid_body', issues: parsed.error.issues });
  }
  try {
    const group = await groupService.createGroup(req.userId!, parsed.data.name);
    return reply.code(201).send(group);
  } catch (err) {
    return handleServiceError(reply, err);
  }
}

export async function joinGroupHandler(
  req: FastifyRequest,
  reply: FastifyReply,
): Promise<FastifyReply> {
  const parsed = JoinGroupBody.safeParse(req.body);
  if (!parsed.success) {
    return reply.code(400).send({ error: 'invalid_body', issues: parsed.error.issues });
  }
  try {
    const result = await groupService.joinGroup(req.userId!, parsed.data.code);
    return reply.code(result.alreadyMember ? 200 : 201).send(result);
  } catch (err) {
    return handleServiceError(reply, err);
  }
}

export async function deleteGroupHandler(
  req: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply,
): Promise<FastifyReply | unknown> {
  try {
    await groupService.deleteGroup(req.userId!, req.params.id);
    return reply.code(204).send();
  } catch (err) {
    return handleServiceError(reply, err);
  }
}

export async function rotateCodeHandler(
  req: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply,
): Promise<FastifyReply | unknown> {
  try {
    const summary = await groupService.rotateGroupCode(req.userId!, req.params.id);
    return reply.send(summary);
  } catch (err) {
    return handleServiceError(reply, err);
  }
}

export async function getGroupHandler(
  req: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply,
): Promise<FastifyReply | unknown> {
  try {
    const detail = await groupService.getGroupDetail(req.userId!, req.params.id);
    return reply.send(detail);
  } catch (err) {
    return handleServiceError(reply, err);
  }
}

export async function updateConstraintsHandler(
  req: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply,
): Promise<FastifyReply | unknown> {
  const parsed = ConstraintsBody.safeParse(req.body);
  if (!parsed.success) {
    return reply.code(400).send({ error: 'invalid_body', issues: parsed.error.issues });
  }
  const data = parsed.data;
  if (data.noEarlierThan !== undefined && data.noLaterThan !== undefined && data.noLaterThan <= data.noEarlierThan) {
    return reply.code(400).send({ error: 'invalid_hours' });
  }
  if (
    data.lunchBreak !== undefined &&
    data.lunchBreak.endMinute <= data.lunchBreak.startMinute
  ) {
    return reply.code(400).send({ error: 'invalid_lunch_break' });
  }
  try {
    const updated = await groupService.updateConstraints(
      req.userId!,
      req.params.id,
      data,
    );
    return reply.send(updated);
  } catch (err) {
    return handleServiceError(reply, err);
  }
}
