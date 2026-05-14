import type { FastifyInstance } from 'fastify';
import { Types } from 'mongoose';
import { z } from 'zod';
import { streamText, convertToModelMessages, stepCountIs, type LanguageModel, type UIMessage } from 'ai';
import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import { MembershipModel } from '../groups/membership.model.js';
import { env } from '../../config/env.js';
import { buildChatTools } from './tools.js';
import { buildSystemPrompt } from './system-prompt.js';

const ChatBody = z.object({
  messages: z.array(z.any()).min(1),
});

export default async function chatRoutes(app: FastifyInstance): Promise<void> {
  app.post<{ Params: { id: string } }>(
    '/groups/:id/chat',
    { preHandler: [app.requireAuth] },
    async (req, reply) => {
      const log = req.log.child({ route: 'chat', groupId: req.params.id, userId: req.userId });
      log.info('chat_request_received');

      if (!env.OPENROUTER_API_KEY) {
        log.warn('chat_not_configured: OPENROUTER_API_KEY missing in env');
        return reply.code(503).send({ error: 'chat_not_configured' });
      }

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

      log.info(
        { messageCount: parsed.data.messages.length, model: env.OPENROUTER_MODEL },
        'chat_starting_stream',
      );

      const openrouter = createOpenRouter({ apiKey: env.OPENROUTER_API_KEY });
      const tools = buildChatTools({ userId, groupId });
      const system = buildSystemPrompt(new Date());

      const messages = parsed.data.messages as UIMessage[];

      const result = streamText({
        model: openrouter.chat(env.OPENROUTER_MODEL) as unknown as LanguageModel,
        system,
        messages: convertToModelMessages(messages),
        tools,
        stopWhen: stepCountIs(5),
        onError: ({ error }) => {
          log.error({ err: error }, 'chat_streamtext_error');
        },
        onFinish: ({ finishReason, usage }) => {
          log.info({ finishReason, usage }, 'chat_streamtext_finished');
        },
        // Cache the system prompt + tool definitions across requests.
        // Anthropic cache-control via OpenRouter — single shared key per group.
        providerOptions: {
          openrouter: {
            cacheControl: { type: 'ephemeral' },
          },
        },
      });

      // Bridge the AI SDK's Web Response to the Fastify reply stream.
      const response = result.toUIMessageStreamResponse();
      log.info({ status: response.status, hasBody: !!response.body }, 'chat_response_ready');

      reply.hijack();
      const headers: Record<string, string> = {};
      response.headers.forEach((v: string, k: string) => {
        headers[k] = v;
      });

      // reply.hijack() bypasses Fastify's CORS hook, so echo the headers
      // manually — otherwise the browser blocks the stream with "Failed to
      // fetch" even though the OPTIONS preflight succeeded.
      const origin = req.headers.origin;
      if (origin) {
        const allowed =
          origin === env.FRONTEND_URL ||
          (env.NODE_ENV === 'development' && /^http:\/\/localhost:\d+$/.test(origin));
        if (allowed) {
          headers['access-control-allow-origin'] = origin;
          headers['access-control-allow-credentials'] = 'true';
          headers['vary'] = 'Origin';
        }
      }

      log.info({ headers }, 'chat_writing_headers');
      reply.raw.writeHead(response.status, headers);

      reply.raw.on('close', () => log.warn('chat_raw_close'));
      reply.raw.on('error', (err) => log.error({ err }, 'chat_raw_error'));
      req.raw.on('aborted', () => log.warn('chat_req_aborted'));

      if (!response.body) {
        log.warn('chat_response_no_body');
        reply.raw.end();
        return;
      }

      const reader = response.body.getReader();
      let chunkCount = 0;
      let byteCount = 0;
      try {
        log.info('chat_pump_start');
        while (true) {
          const { done, value } = await reader.read();
          if (done) {
            log.info('chat_pump_reader_done');
            break;
          }
          chunkCount += 1;
          byteCount += value?.byteLength ?? 0;
          if (chunkCount <= 3) {
            const preview =
              value instanceof Uint8Array
                ? new TextDecoder().decode(value).slice(0, 200)
                : '<non-uint8>';
            log.info({ chunkCount, size: value?.byteLength, preview }, 'chat_chunk');
          }
          reply.raw.write(value);
        }
        log.info({ chunkCount, byteCount }, 'chat_stream_done');
      } catch (err) {
        log.error({ err, chunkCount, byteCount }, 'chat_stream_error');
      } finally {
        reply.raw.end();
      }
    },
  );
}
