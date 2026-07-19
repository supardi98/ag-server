import fastifyCookie from '@fastify/cookie';
import fastifySession from '@fastify/session';
import { FastifyInstance } from 'fastify';
import { config } from '../config/env.js';

export async function registerSession(fastify: FastifyInstance) {
  await fastify.register(fastifyCookie);
  await fastify.register(fastifySession, {
    secret: config.AUTH_SESSION_SECRET,
    cookieName: 'ag_session',
    cookie: {
      secure: false, // set true if behind HTTPS
      httpOnly: true,
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    },
  });
}
