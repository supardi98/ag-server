import Fastify from 'fastify';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import fastifyStatic from '@fastify/static';
import middie from '@fastify/middie';
import { createServer as createViteServer, ViteDevServer } from 'vite';
import vue from '@vitejs/plugin-vue';
import type { IncomingMessage, ServerResponse } from 'http';

type NextFunction = (err?: Error) => void;
import path from 'path';
import { fileURLToPath } from 'url';
import { config } from './config/env.js';
import { statusRoutes } from './routes/status.js';
import { authRoutes } from './routes/auth.js';
import { registerSession } from './plugins/session.js';
import { dbService } from './services/db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const isDev = process.env.NODE_ENV !== 'production';

const fastify = Fastify({ logger: true });

// Initialize DB
dbService.set('startup_time', new Date().toISOString());
fastify.log.info(`SQLite initialized. Last startup: ${dbService.get('startup_time')}`);

// Register session (must be before routes)
await registerSession(fastify);

// Register Swagger
await fastify.register(swagger, {
  openapi: {
    info: {
      title: 'Antigravity Remote API',
      description: 'OpenAPI Provider for Antigravity sessions',
      version: '1.0.0',
    },
    servers: [{ url: `http://${config.HOST}:${config.PORT}` }],
  },
});

await fastify.register(swaggerUi, {
  routePrefix: '/docs',
  uiConfig: { docExpansion: 'list', deepLinking: false },
});

// Register API routes
await fastify.register(authRoutes);
await fastify.register(statusRoutes);

if (isDev) {
  fastify.log.info('Development mode: mounting Vite as middleware (single port)');

  await fastify.register(middie);

  const vite: ViteDevServer = await createViteServer({
    configFile: false,
    plugins: [vue()],
    server: { middlewareMode: true },
    appType: 'spa',
    root: path.resolve(__dirname, '../../frontend'),
  });

  // Mount Vite middleware — with appType 'spa', Vite auto-serves index.html
  fastify.use(
    (req: IncomingMessage, res: ServerResponse, next: NextFunction) => {
      if (req.url?.startsWith('/api') || req.url?.startsWith('/docs')) {
        return next();
      }
      vite.middlewares(req, res, next);
    }
  );
} else {
  // Production: serve compiled frontend from dist/
  await fastify.register(fastifyStatic, {
    root: path.resolve(__dirname, '../../frontend/dist'),
    prefix: '/',
    wildcard: false,
  });

  fastify.setNotFoundHandler(async (_request, reply) => {
    return reply.sendFile('index.html');
  });
}

const start = async () => {
  try {
    await fastify.listen({ port: config.PORT, host: config.HOST });
    fastify.log.info(`Server on http://${config.HOST}:${config.PORT}`);
    fastify.log.info(`API Docs at http://${config.HOST}:${config.PORT}/docs`);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start();
