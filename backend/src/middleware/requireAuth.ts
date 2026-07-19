import { FastifyReply, FastifyRequest } from 'fastify';
import { config } from '../config/env.js';

export async function requireAuth(request: FastifyRequest, reply: FastifyReply) {
  // If auth is disabled, always allow
  if (!config.AUTH_ENABLED) return;

  const session = request.session as any;
  if (!session?.authenticated) {
    reply.code(401).send({ error: 'Unauthorized' });
  }
}
