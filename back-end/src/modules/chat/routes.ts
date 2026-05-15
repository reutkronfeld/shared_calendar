import { Readable } from 'node:stream';
import type { FastifyInstance } from 'fastify';
import { Types } from 'mongoose';
import { z } from 'zod';
import { MembershipModel } from '../groups/membership.model.js';
import { GroupModel } from '../groups/group.model.js';
import { env } from '../../config/env.js';
import * as groupService from '../groups/group.service.js';
import { UserModel } from '../users/user.model.js';
import { fetchEventsForUser } from '../calendar/events.js';
import { classifyEvents } from '../calendar/classifier.js';
import { NegotiationSessionModel } from '../groups/negotiation.model.js';

const ChatBody = z.object({
  messages: z.array(z.any()).min(1),
});

async function getGroupChatContext(groupId: string) {
  if (!Types.ObjectId.isValid(groupId)) throw new Error('invalid_id');

  const group = await GroupModel.findById(groupId).lean();
  if (!group) throw new Error('group_not_found');

  const members = await MembershipModel.find({ groupId: new Types.ObjectId(groupId) })
    .populate<{ userId: any }>({ path: 'userId', select: 'name email picture refreshToken' })
    .lean();

  const calendars: Record<string, any[]> = {};
  const rangeStart = new Date();
  // Fetch 45 days ahead to catch future questions (like June 25th)
  const rangeEnd = new Date(rangeStart.getTime() + 45 * 24 * 60 * 60 * 1000);

  for (const m of members) {
    const u = m.userId;
    if (!u || !u.refreshToken) {
      calendars[u?.name || 'Unknown'] = [];
      continue;
    }
    try {
      const events = await fetchEventsForUser(u.refreshToken, rangeStart, rangeEnd);
      const summaries = events.map((e) => e.summary);
      const importance = await classifyEvents(summaries);

      calendars[u.name] = events.map((e, idx) => ({
        id: e.id,
        title: e.summary,
        start: e.start.toISOString(),
        end: e.end.toISOString(),
        importance: importance[idx],
        flexible: importance[idx] === 'movable',
      }));
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error(`[chat-context] Failed to fetch events for ${u.name}:`, err);
      calendars[u.name] = [];
    }
  }

  return {
    members: members.map(m => ({
      userId: m.userId._id.toString(),
      name: m.userId.name,
      email: m.userId.email,
      picture: m.userId.picture ?? null,
      role: m.role,
      joinedAt: m.joinedAt,
    })),
    constraints: group.constraints ?? groupService.DEFAULT_CONSTRAINTS,
    calendars,
  };
}

export default async function chatRoutes(app: FastifyInstance): Promise<void> {
  // INTERNAL ROUTE: For Streamlit to pull data directly
  app.get<{ Params: { id: string } }>(
    '/internal/groups/:id/context',
    async (req, reply) => {
      const { id } = req.params;
      const remoteIp = req.ip;

      // Restrict to localhost
      if (remoteIp !== '127.0.0.1' && remoteIp !== '::1' && remoteIp !== 'localhost') {
        req.log.warn({ remoteIp }, 'internal_context_unauthorized_ip');
        return reply.code(403).send({ error: 'forbidden' });
      }

      try {
        const context = await getGroupChatContext(id);
        return context;
      } catch (err) {
        req.log.error({ err, id }, 'internal_context_failed');
        return reply.code(500).send({ error: 'failed_to_fetch_context' });
      }
    },
  );

  app.post<{ Params: { id: string } }>(
    '/groups/:id/chat',
    { preHandler: [app.requireAuth] },
    async (req, reply) => {
      const log = req.log.child({ route: 'chat', groupId: req.params.id, userId: req.userId });
      log.info('chat_request_received');

      const { id } = req.params;
      if (!Types.ObjectId.isValid(id)) {
        log.warn({ id }, 'chat_invalid_group_id');
        return reply.code(400).send({ error: 'invalid_id' });
      }

      const parsed = ChatBody.safeParse(req.body);
      if (!parsed.success) {
        log.warn({ issues: parsed.error.issues }, 'chat_invalid_body');
        return reply.code(400).send({ error: 'invalid_body', issues: parsed.error.issues });
      }

      const userId = req.userId!;
      const groupId = id;

      // Authorization: must be a member of this group.
      const membership = await MembershipModel.findOne({
        groupId: new Types.ObjectId(groupId),
        userId: new Types.ObjectId(userId),
      });
      if (!membership) {
        log.warn('chat_not_a_member');
        return reply.code(403).send({ error: 'not_a_member' });
      }

      // --- 1. Gather Context for Python Chatbot ---
      const context = await getGroupChatContext(groupId);

      const formattedMessages = parsed.data.messages.map((m: any) => {
        let content = '';
        if (typeof m.content === 'string') {
          content = m.content;
        } else if (Array.isArray(m.parts)) {
          content = m.parts
            .filter((p: any) => p.type === 'text')
            .map((p: any) => p.text)
            .join('');
        }
        return {
          role: m.role === 'assistant' ? 'assistant' : 'user',
          content: content || '',
        };
      });

      // --- 2. Forward to Python Service ---
      log.info('chat_forwarding_to_python');
      try {
        const pythonResp = await fetch('http://localhost:8000/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            messages: formattedMessages,
            context,
          }),
        });

        if (!pythonResp.ok) {
          const errorBody = await pythonResp.text();
          log.error({ status: pythonResp.status, errorBody, sentBody: formattedMessages }, 'chat_python_service_error');
          return reply.code(502).send({ error: 'python_service_error', detail: errorBody });
        }

        if (!pythonResp.body) {
          return reply.code(204).send();
        }

        // Set headers for Vercel AI SDK
        reply.header('Content-Type', 'text/plain; charset=utf-8');
        reply.header('X-Vercel-AI-Data-Stream', 'v1');
        reply.header('Cache-Control', 'no-cache');
        reply.header('Connection', 'keep-alive');

        // Forward the stream using a manual reader to ensure no buffering
        const reader = pythonResp.body.getReader();
        const stream = new Readable({
          async read() {
            try {
              const { done, value } = await reader.read();
              if (done) {
                this.push(null);
              } else {
                this.push(Buffer.from(value));
              }
            } catch (err) {
              this.destroy(err as Error);
            }
          }
        });

        return reply.send(stream);
      } catch (err) {
        log.error({ err }, 'chat_proxy_failed');
        return reply.code(500).send({ error: 'internal_proxy_error' });
      }
    },
  );

  app.post<{ Params: { sessionId: string } }>(
    '/negotiate/:sessionId/chat',
    { preHandler: [app.requireAuth] },
    async (req, reply) => {
      req.log.info({ sessionId: req.params.sessionId }, 'negotiate_chat_received');
      const log = req.log.child({ route: 'negotiate_chat', sessionId: req.params.sessionId, userId: req.userId });
      const { sessionId } = req.params;

      if (!Types.ObjectId.isValid(sessionId)) return reply.code(400).send({ error: 'invalid_id' });

      const session = await NegotiationSessionModel.findById(sessionId);
      if (!session) return reply.code(404).send({ error: 'session_not_found' });

      const userId = req.userId!;
      const blocker = session.pendingMembers.find((m) => m.userId.toString() === userId);
      if (!blocker && session.creatorId.toString() !== userId) {
        return reply.code(403).send({ error: 'unauthorized' });
      }

      // --- Gather Context ---
      const groupContext = await getGroupChatContext(session.groupId.toString());

      const parsed = ChatBody.safeParse(req.body);
      if (!parsed.success) return reply.code(400).send({ error: 'invalid_body', issues: parsed.error.issues });

      const formattedMessages = parsed.data.messages.map((m: any) => {
        let content = '';
        if (typeof m.content === 'string') {
          content = m.content;
        } else if (Array.isArray(m.parts)) {
          content = m.parts
            .filter((p: any) => p.type === 'text')
            .map((p: any) => p.text)
            .join('');
        }
        return {
          role: m.role === 'assistant' ? 'assistant' : 'user',
          content: content || '',
        };
      });

      // Inject negotiation system message
      if (blocker) {
        const systemMsg = {
          role: 'assistant', // Use assistant role for the prompt injection or just role: system if supported
          content: `(System: You are in a PRIVATE negotiation with ${groupContext.members.find((m) => m.userId === userId)?.name}. The group wants to schedule "${session.title}" at ${session.slotStart.toISOString()}. This user has a flexible event "${blocker.summary}" blocking it. Politey ask them to move it.)`,
        };
        // Better to use role 'system' if the python side handles it, but let's stick to the prompt's logic.
        formattedMessages.unshift({ role: 'user', content: `[SYSTEM] Private negotiation for "${session.title}". Blocker: "${blocker.summary}". Ask user to move it.` });
      }

      // --- Forward to Python Service ---
      try {
        const pythonResp = await fetch('http://localhost:8000/chat', {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            'Authorization': req.headers.authorization || '',
          },
          body: JSON.stringify({
            messages: formattedMessages,
            context: {
              ...groupContext,
              sessionId,
            },
          }),
        });

        if (!pythonResp.ok) return reply.code(502).send({ error: 'python_service_error' });
        if (!pythonResp.body) return reply.code(204).send();

        reply.header('Content-Type', 'text/plain; charset=utf-8');
        reply.header('X-Vercel-AI-Data-Stream', 'v1');
        const reader = pythonResp.body.getReader();
        const stream = new Readable({
          async read() {
            try {
              const { done, value } = await reader.read();
              if (done) this.push(null);
              else this.push(Buffer.from(value));
            } catch (err) {
              this.destroy(err as Error);
            }
          },
        });
        return reply.send(stream);
      } catch (err) {
        return reply.code(500).send({ error: 'internal_proxy_error' });
      }
    },
  );
}
