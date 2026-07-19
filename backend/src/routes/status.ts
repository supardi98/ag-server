import { FastifyInstance } from 'fastify';

export async function statusRoutes(fastify: FastifyInstance) {
  fastify.get(
    '/api/status',
    {
      schema: {
        description: 'Get Antigravity connection status',
        tags: ['status'],
        response: {
          200: {
            type: 'object',
            properties: {
              status: { type: 'string' },
              cdpConnected: { type: 'boolean' },
              lsConnected: { type: 'boolean' },
              timestamp: { type: 'string' },
            },
          },
        },
      },
    },
    async (request, reply) => {
      // Temporary stub responses until CDP is wired up
      return {
        status: 'ok',
        cdpConnected: false,
        lsConnected: false,
        timestamp: new Date().toISOString(),
      };
    }
  );
}
