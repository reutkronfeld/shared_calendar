import Fastify from 'fastify';
import cors from '@fastify/cors';
import { env } from './config/env.js';
import { connectMongo } from './db/mongoose.js';
import authPlugin from './plugins/auth.js';
import googleOAuthPlugin from './plugins/oauth-google.js';
import authRoutes from './modules/auth/routes.js';
import groupRoutes from './modules/groups/routes.js';

async function bootstrap(): Promise<void> {
  await connectMongo();

  const app = Fastify({ logger: true });

  await app.register(cors, {
    origin: env.FRONTEND_URL,
    credentials: true,
  });

  await app.register(authPlugin);
  await app.register(googleOAuthPlugin);

  await app.register(authRoutes);
  await app.register(groupRoutes);

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
