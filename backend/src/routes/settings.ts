import { FastifyInstance } from 'fastify';
import { dbService } from '../services/db.js';
import { requireAuth } from '../middleware/requireAuth.js';

const ALLOWED_KEYS = ['antigravity_path', 'antigravity_port', 'auth_password'];

export async function settingsRoutes(fastify: FastifyInstance) {
  // GET /api/settings
  fastify.get(
    '/api/settings',
    { schema: { description: 'Get all configurable settings', tags: ['settings'] }, preHandler: requireAuth },
    async () => {
      const all = dbService.getAllSettings();
      // Mask password in response
      if (all.auth_password) all.auth_password = '••••••••';
      return all;
    }
  );

  // PUT /api/settings
  fastify.put(
    '/api/settings',
    {
      schema: {
        description: 'Update one or more settings',
        tags: ['settings'],
        body: {
          type: 'object',
          additionalProperties: { type: 'string' },
        },
      },
      preHandler: requireAuth,
    },
    async (request, reply) => {
      const updates = request.body as Record<string, string>;
      const updated: string[] = [];
      const rejected: string[] = [];

      for (const [key, value] of Object.entries(updates)) {
        if (!ALLOWED_KEYS.includes(key)) {
          rejected.push(key);
          continue;
        }
        dbService.setSetting(key, value);
        updated.push(key);
      }

      return reply.send({ updated, rejected });
    }
  );
}
