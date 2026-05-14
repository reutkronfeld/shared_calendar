import type { FastifyInstance } from 'fastify';
import {
  createGroupHandler,
  joinGroupHandler,
  getGroupHandler,
  updateConstraintsHandler,
  rotateCodeHandler,
  deleteGroupHandler,
} from './group.controller.js';

export default async function groupRoutes(app: FastifyInstance): Promise<void> {
  app.post('/groups', { preHandler: [app.requireAuth] }, createGroupHandler);
  app.post('/groups/join', { preHandler: [app.requireAuth] }, joinGroupHandler);
  app.get<{ Params: { id: string } }>(
    '/groups/:id',
    { preHandler: [app.requireAuth] },
    getGroupHandler,
  );
  app.patch<{ Params: { id: string } }>(
    '/groups/:id/constraints',
    { preHandler: [app.requireAuth] },
    updateConstraintsHandler,
  );
  app.post<{ Params: { id: string } }>(
    '/groups/:id/rotate-code',
    { preHandler: [app.requireAuth] },
    rotateCodeHandler,
  );
  app.delete<{ Params: { id: string } }>(
    '/groups/:id',
    { preHandler: [app.requireAuth] },
    deleteGroupHandler,
  );
}
