import { FastifyInstance } from 'fastify';
import { config } from '../config/env.js';

export async function authRoutes(fastify: FastifyInstance) {
  // GET /api/auth/me — Check if user is authenticated
  fastify.get(
    '/api/auth/me',
    {
      schema: {
        description: 'Check current authentication status',
        tags: ['auth'],
        response: {
          200: {
            type: 'object',
            properties: {
              authenticated: { type: 'boolean' },
              authEnabled: { type: 'boolean' },
            },
          },
        },
      },
    },
    async (request, reply) => {
      const session = request.session as any;
      const authenticated = !config.AUTH_ENABLED || !!session?.authenticated;
      return { authenticated, authEnabled: config.AUTH_ENABLED };
    }
  );

  // POST /api/auth/login — Submit password to create session
  fastify.post(
    '/api/auth/login',
    {
      schema: {
        description: 'Login with password',
        tags: ['auth'],
        body: {
          type: 'object',
          required: ['password'],
          properties: {
            password: { type: 'string' },
          },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
            },
          },
          401: {
            type: 'object',
            properties: {
              error: { type: 'string' },
            },
          },
        },
      },
    },
    async (request, reply) => {
      const { password } = request.body as { password: string };
      if (password !== config.AUTH_PASSWORD) {
        return reply.code(401).send({ error: 'Invalid password' });
      }
      const session = request.session as any;
      session.authenticated = true;
      return { success: true };
    }
  );

  // POST /api/auth/logout — Destroy session
  fastify.post(
    '/api/auth/logout',
    {
      schema: {
        description: 'Logout and destroy session',
        tags: ['auth'],
        response: {
          200: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
            },
          },
        },
      },
    },
    async (request, reply) => {
      await request.session.destroy();
      return { success: true };
    }
  );
}
