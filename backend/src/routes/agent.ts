import { FastifyInstance } from 'fastify';
import { agentService } from '../services/agent.js';
import { requireAuth } from '../middleware/requireAuth.js';

export async function agentRoutes(fastify: FastifyInstance) {
  // GET /api/agent/status
  fastify.get(
    '/api/agent/status',
    { schema: { description: 'Get Antigravity process status', tags: ['agent'] }, preHandler: requireAuth },
    async () => agentService.status()
  );

  // POST /api/agent/start
  fastify.post(
    '/api/agent/start',
    { schema: { description: 'Start the Antigravity process', tags: ['agent'] }, preHandler: requireAuth },
    async (_req, reply) => {
      const result = agentService.start();
      return reply.code(result.ok ? 200 : 409).send(result);
    }
  );

  // POST /api/agent/stop
  fastify.post(
    '/api/agent/stop',
    { schema: { description: 'Stop the Antigravity process', tags: ['agent'] }, preHandler: requireAuth },
    async (_req, reply) => {
      const result = agentService.stop();
      return reply.code(result.ok ? 200 : 409).send(result);
    }
  );

  // GET /api/agent/logs — SSE stream
  fastify.get(
    '/api/agent/logs',
    { schema: { description: 'Stream Antigravity logs via SSE', tags: ['agent'] }, preHandler: requireAuth },
    async (request, reply) => {
      reply.raw.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no',
      });

      const sendEvent = (data: string) => {
        const lines = data.split('\n').filter(Boolean);
        for (const line of lines) {
          reply.raw.write(`data: ${JSON.stringify(line)}\n\n`);
        }
      };

      // Send current status
      reply.raw.write(`data: ${JSON.stringify('[ag-server] Connected to log stream.')}\n\n`);

      agentService.on('log', sendEvent);

      const sendStatus = (status: any) => {
        reply.raw.write(`event: status-change\ndata: ${JSON.stringify(status)}\n\n`);
      };

      agentService.on('status-change', sendStatus);

      request.raw.on('close', () => {
        agentService.off('log', sendEvent);
        agentService.off('status-change', sendStatus);
      });

      // Keep connection open
      await new Promise(() => {});
    }
  );
}
