import { FastifyInstance } from 'fastify';
import net from 'net';
import { execSync } from 'child_process';
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

// Helper to check if Language Server process is running in the OS
function isLanguageServerRunning(): boolean {
  try {
    // pgrep exits with 0 if matching process is found, 1 if not
    execSync('pgrep -f "language_server"');
    return true;
  } catch {
    return false;
  }
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

      // Check if Language Server process is alive
      const lsConnected = isLanguageServerRunning();

      return {
        status: 'ok',
        cdpConnected,
        lsConnected,
        timestamp: new Date().toISOString(),
      };
    }
  );
}
