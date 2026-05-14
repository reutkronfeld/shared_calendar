import type { FastifyInstance } from 'fastify';
import { Types } from 'mongoose';
import { z } from 'zod';
import { GroupModel, type GroupDoc } from './group.model.js';
import { MembershipModel } from './membership.model.js';
import type { User } from '../users/user.model.js';
import { generateGroupCode, normalizeGroupCode } from '../../lib/slug.js';

const CreateGroupBody = z.object({
  name: z.string().trim().min(1).max(100),
});

const JoinGroupBody = z.object({
  code: z.string().min(3).max(60),
});

export default async function groupRoutes(app: FastifyInstance): Promise<void> {
  /** POST /groups  →  { id, code, name } */
  app.post('/groups', { preHandler: [app.requireAuth] }, async (req, reply) => {
    const parsed = CreateGroupBody.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'invalid_body', issues: parsed.error.issues });
    }

    const userId = new Types.ObjectId(req.userId!);

    let group: GroupDoc | undefined;
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const code = generateGroupCode();
      try {
        group = await GroupModel.create({
          code,
          name: parsed.data.name,
          organizerId: userId,
        });
        break;
      } catch (e: unknown) {
        if ((e as { code?: number }).code === 11000) continue;
        throw e;
      }
    }
    if (!group) {
      return reply.code(500).send({ error: 'could_not_generate_code' });
    }

    await MembershipModel.create({
      groupId: group._id,
      userId,
      role: 'organizer',
    });

    return reply.code(201).send({
      id: group._id.toString(),
      code: group.code,
      name: group.name,
    });
  });

  /** POST /groups/join  →  { id, code, name, alreadyMember? } */
  app.post('/groups/join', { preHandler: [app.requireAuth] }, async (req, reply) => {
    const parsed = JoinGroupBody.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'invalid_body', issues: parsed.error.issues });
    }

    const code = normalizeGroupCode(parsed.data.code);
    const userId = new Types.ObjectId(req.userId!);

    const group = await GroupModel.findOne({ code });
    if (!group) return reply.code(404).send({ error: 'group_not_found' });

    const existing = await MembershipModel.findOne({ groupId: group._id, userId });
    if (existing) {
      return reply.send({
        id: group._id.toString(),
        code: group.code,
        name: group.name,
        alreadyMember: true,
      });
    }

    await MembershipModel.create({
      groupId: group._id,
      userId,
      role: 'member',
    });

    return reply.code(201).send({
      id: group._id.toString(),
      code: group.code,
      name: group.name,
    });
  });

  /** GET /groups/:id  →  { id, code, name, organizerId, members } */
  app.get<{ Params: { id: string } }>(
    '/groups/:id',
    { preHandler: [app.requireAuth] },
    async (req, reply) => {
      if (!Types.ObjectId.isValid(req.params.id)) {
        return reply.code(400).send({ error: 'invalid_id' });
      }
      const groupId = new Types.ObjectId(req.params.id);
      const userId = new Types.ObjectId(req.userId!);

      const membership = await MembershipModel.findOne({ groupId, userId });
      if (!membership) return reply.code(403).send({ error: 'not_a_member' });

      const group = await GroupModel.findById(groupId).lean();
      if (!group) return reply.code(404).send({ error: 'group_not_found' });

      const members = await MembershipModel.find({ groupId })
        .populate<{ userId: User }>({ path: 'userId', select: 'name email picture' })
        .lean();

      return {
        id: group._id.toString(),
        code: group.code,
        name: group.name,
        organizerId: group.organizerId.toString(),
        members: members.map((m) => ({
          userId: m.userId._id.toString(),
          name: m.userId.name,
          email: m.userId.email,
          picture: m.userId.picture ?? null,
          role: m.role,
          joinedAt: m.joinedAt,
        })),
      };
    },
  );
}
