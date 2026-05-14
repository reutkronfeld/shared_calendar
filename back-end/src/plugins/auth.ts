import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import fp from 'fastify-plugin';
import fastifyCookie from '@fastify/cookie';
import fastifyJwt from '@fastify/jwt';
import { env } from '../config/env.js';

export const SESSION_COOKIE = 'session';

declare module 'fastify' {
  interface FastifyInstance {
    requireAuth: (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
    issueSessionCookie: (reply: FastifyReply, userId: string) => void;
    clearSessionCookie: (reply: FastifyReply) => void;
  }
  interface FastifyRequest {
    userId?: string;
  }
}

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: { sub: string };
    user: { sub: string };
  }
}

export default fp(async function authPlugin(app: FastifyInstance) {
  await app.register(fastifyCookie);
  await app.register(fastifyJwt, {
    secret: env.JWT_SECRET,
    cookie: { cookieName: SESSION_COOKIE, signed: false },
    sign: { expiresIn: env.JWT_TTL },
  });

  app.decorate('issueSessionCookie', (reply: FastifyReply, userId: string) => {
    const token = reply.server.jwt.sign({ sub: userId });
    reply.setCookie(SESSION_COOKIE, token, {
      path: '/',
      httpOnly: true,
      secure: env.COOKIE_SECURE,
      sameSite: 'lax',
      domain: env.COOKIE_DOMAIN,
      // 7 days, matches JWT TTL
      maxAge: 60 * 60 * 24 * 7,
    });
  });

  app.decorate('clearSessionCookie', (reply: FastifyReply) => {
    reply.clearCookie(SESSION_COOKIE, {
      path: '/',
      httpOnly: true,
      secure: env.COOKIE_SECURE,
      sameSite: 'lax',
      domain: env.COOKIE_DOMAIN,
    });
  });

  app.decorate('requireAuth', async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      const decoded = await req.jwtVerify<{ sub: string }>();
      req.userId = decoded.sub;
    } catch {
      reply.code(401).send({ error: 'unauthorized' });
    }
  });
});
