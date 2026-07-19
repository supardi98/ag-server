import { FastifyInstance } from 'fastify';
import net from 'net';
import { dbService } from '../services/db.js';

// Helper to check if a TCP port is open/listening locally
function checkPort(port: number, host: string): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    const timeout = 1000;

    socket.setTimeout(timeout);
    socket.once('connect', () => {
      socket.destroy();
      resolve(true);
    });

    socket.once('timeout', () => {
      socket.destroy();
      resolve(false);
    });

    socket.once('error', () => {
      socket.destroy();
      resolve(false);
    });

    socket.connect(port, host);
  });
}

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
      // Get the configured port from SQLite settings (fallback to 9000 if not found)
      const cdpPort = parseInt(dbService.getSetting('antigravity_port') || '9000', 10);
      const cdpHost = '127.0.0.1';

      // Check if Antigravity's CDP port is open and listening
      const cdpConnected = await checkPort(cdpPort, cdpHost);

      return {
        status: 'ok',
        cdpConnected,
        lsConnected: false, // Language Server status can be wired up here if needed
        timestamp: new Date().toISOString(),
      };
    }
  );
}
