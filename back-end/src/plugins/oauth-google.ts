import type { FastifyInstance } from 'fastify';
import fp from 'fastify-plugin';
import oauth2 from '@fastify/oauth2';
import type { OAuth2Namespace } from '@fastify/oauth2';
import { randomUUID } from 'node:crypto';
import { env } from '../config/env.js';

declare module 'fastify' {
  interface FastifyInstance {
    googleOAuth: OAuth2Namespace;
  }
}

// The standard Google provider config. We inline it instead of using
// `oauth2.GOOGLE_CONFIGURATION` because the type for the default CJS
// export of @fastify/oauth2 doesn't surface the static configs, even
// though they're attached at runtime.
const GOOGLE_PROVIDER = {
  authorizeHost: 'https://accounts.google.com',
  authorizePath: '/o/oauth2/v2/auth',
  tokenHost: 'https://www.googleapis.com',
  tokenPath: '/oauth2/v4/token',
};

/**
 * Google OAuth — login + Calendar scopes.
 *   GET /auth/google           → redirect to Google (registered by @fastify/oauth2)
 *   GET /auth/google/callback  → handled in modules/auth/routes.ts
 */
export default fp(async function googleOAuthPlugin(app: FastifyInstance) {
  await app.register(oauth2, {
    name: 'googleOAuth',
    scope: [
      'openid',
      'email',
      'profile',
      'https://www.googleapis.com/auth/calendar.readonly',
      'https://www.googleapis.com/auth/calendar.events',
    ],
    credentials: {
      client: {
        id: env.GOOGLE_CLIENT_ID,
        secret: env.GOOGLE_CLIENT_SECRET,
      },
      auth: GOOGLE_PROVIDER,
    },
    startRedirectPath: '/auth/google',
    callbackUri: env.GOOGLE_REDIRECT_URI,
    pkce: 'S256',
    // Appended to the authorization URL. `access_type=offline` + `prompt=consent`
    // make Google always return a refresh_token, not just on the first auth.
    callbackUriParams: {
      access_type: 'offline',
      prompt: 'consent',
    },
    generateStateFunction: () => randomUUID(),
    checkStateFunction: () => true,
  });
});
