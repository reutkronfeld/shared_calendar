import type { FastifyInstance } from 'fastify';
import { google } from 'googleapis';
import { env } from '../../config/env.js';
import { encrypt } from '../../lib/crypto.js';
import { UserModel, type User } from '../users/user.model.js';
import { MembershipModel } from '../groups/membership.model.js';
import type { Group } from '../groups/group.model.js';

/**
 * Auth routes:
 *   GET  /auth/google           → starts OAuth (registered by @fastify/oauth2)
 *   GET  /auth/google/callback  → finishes OAuth, sets session cookie, redirects to FE
 *   POST /auth/logout           → clears the session cookie
 *   GET  /me                    → returns current user + memberships
 */
export default async function authRoutes(app: FastifyInstance): Promise<void> {
  // OAuth callback
  app.get('/auth/google/callback', async (req, reply) => {
    const tokens = await app.googleOAuth.getAccessTokenFromAuthorizationCodeFlow(req);

    // Use the access token to fetch userinfo
    const oauth2Client = new google.auth.OAuth2();
    oauth2Client.setCredentials({ access_token: tokens.token.access_token });
    const userinfo = await google
      .oauth2({ version: 'v2', auth: oauth2Client })
      .userinfo.get();

    const profile = userinfo.data;
    if (!profile.id || !profile.email) {
      return reply.code(500).send({ error: 'google_profile_missing_fields' });
    }

    const update: Partial<User> = {
      googleId: profile.id,
      email: profile.email,
      name: profile.name ?? profile.email,
    };
    if (profile.picture) update.picture = profile.picture;
    if (tokens.token.refresh_token) {
      update.refreshToken = encrypt(tokens.token.refresh_token);
    }

    const user = await UserModel.findOneAndUpdate(
      { googleId: profile.id },
      { $set: update },
      { new: true, upsert: true },
    );
    if (!user) {
      return reply.code(500).send({ error: 'user_upsert_failed' });
    }

    app.issueSessionCookie(reply, user._id.toString());

    const rawNext = req.cookies?.oauth_next;
    const next =
      typeof rawNext === 'string' && rawNext.startsWith('/') && !rawNext.startsWith('//')
        ? rawNext
        : '/groups';
    if (rawNext) {
      reply.clearCookie('oauth_next', { path: '/' });
    }
    reply.redirect(`${env.FRONTEND_URL}${next}`);
  });

  app.post('/auth/logout', async (_req, reply) => {
    app.clearSessionCookie(reply);
    return reply.send({ ok: true });
  });

  app.get('/me', { preHandler: [app.requireAuth] }, async (req, reply) => {
    const userId = req.userId!;
    const user = await UserModel.findById(userId).lean();
    if (!user) {
      app.clearSessionCookie(reply);
      return reply.code(401).send({ error: 'user_not_found' });
    }

    const memberships = await MembershipModel.find({ userId })
      .populate<{ groupId: Group }>('groupId')
      .lean();

    return {
      user: {
        id: user._id.toString(),
        email: user.email,
        name: user.name,
        picture: user.picture ?? null,
        defaultTimeZone: user.defaultTimeZone,
      },
      memberships: memberships.map((m) => ({
        groupId: m.groupId._id.toString(),
        code: m.groupId.code,
        name: m.groupId.name,
        role: m.role,
        joinedAt: m.joinedAt,
      })),
    };
  });
}
