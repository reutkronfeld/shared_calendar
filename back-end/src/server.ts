import Fastify from 'fastify';
import cors from '@fastify/cors';
import { env } from './config/env.js';
import { connectMongo } from './db/mongoose.js';
import authPlugin from './plugins/auth.js';
import googleOAuthPlugin from './plugins/oauth-google.js';
import authRoutes from './modules/auth/routes.js';
import groupRoutes from './modules/groups/routes.js';
import calendarRoutes from './modules/calendar/routes.js';
import availabilityRoutes from './modules/availability/routes.js';
import chatRoutes from './modules/chat/routes.js';

async function bootstrap(): Promise<void> {
  await connectMongo();

  const app = Fastify({ logger: true });

  await app.register(cors, {
    origin: (origin, cb) => {
      if (!origin) return cb(null, true);
      if (origin === env.FRONTEND_URL) return cb(null, true);
      if (env.NODE_ENV === 'development' && /^http:\/\/localhost:\d+$/.test(origin)) {
        return cb(null, true);
      }
      cb(new Error('not_allowed_by_cors'), false);
    },
    credentials: true,
  });

  await app.register(authPlugin);
  await app.register(googleOAuthPlugin);

  await app.register(authRoutes);
  await app.register(groupRoutes);
  await app.register(calendarRoutes);
  await app.register(availabilityRoutes);
  await app.register(chatRoutes);

  app.get('/health', async () => ({ ok: true, ts: new Date().toISOString() }));

  try {
    await app.listen({ port: env.PORT, host: '0.0.0.0' });
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

bootstrap().catch((err: unknown) => {
  // eslint-disable-next-line no-console
  console.error('[bootstrap] failed:', err);
  process.exit(1);
});
