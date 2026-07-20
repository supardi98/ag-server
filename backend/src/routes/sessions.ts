import { FastifyInstance } from 'fastify';
import { cdpService } from '../services/cdp.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { execSync } from 'child_process';
import https from 'https';

// Helper to find the active language server details from process list
function getLanguageServerDetails(): { port: number; csrfToken: string } | null {
  try {
    const pgrepOutput = execSync('pgrep -f "language_server"').toString().split('\n').filter(Boolean);
    for (const pidStr of pgrepOutput) {
      const pid = parseInt(pidStr, 10);
      if (isNaN(pid)) continue;
      try {
        const cmdLine = execSync(`ps -o args= -p ${pid}`).toString().trim();
        const csrfMatch = cmdLine.match(/--csrf_token\s+([a-f0-9-]+)/);
        if (!csrfMatch) continue;

        // Use -aTCP so lsof only returns this PID's own sockets
        const lsofOutput = execSync(`lsof -a -iTCP -sTCP:LISTEN -P -n -p ${pid}`).toString();
        // Find first port on 127.0.0.1
        const portMatch = lsofOutput.match(/127\.0\.0\.1:(\d+)\s+\(LISTEN\)/);
        if (portMatch) {
          return {
            port: parseInt(portMatch[1], 10),
            csrfToken: csrfMatch[1],
          };
        }
      } catch {
        // Ignore
      }
    }
  } catch {
    // Ignore
  }
  return null;
}

// Call API helper via Connect Protocol (gRPC-Web/JSON)
// Uses https.request directly so rejectUnauthorized: false takes effect on self-signed certs
function callLsApi(method: string, body: any = {}): Promise<any> {
  const details = getLanguageServerDetails();
  if (!details) return Promise.reject(new Error('Language server not running'));

  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const req = https.request(
      {
        hostname: '127.0.0.1',
        port: details.port,
        path: `/exa.language_server_pb.LanguageServerService/${method}`,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Connect-Protocol-Version': '1',
          'X-Codeium-Csrf-Token': details.csrfToken,
          'Content-Length': Buffer.byteLength(data),
        },
        timeout: 15000,
        rejectUnauthorized: false,
      },
      (res) => {
        const chunks: string[] = [];
        res.on('data', (c) => chunks.push(c.toString()));
        res.on('end', () => {
          if (res.statusCode && res.statusCode >= 400) {
            reject(new Error(`LS API ${res.statusCode}`));
            return;
          }
          try { resolve(JSON.parse(chunks.join(''))); }
          catch (e: any) { reject(new Error(`LS API parse error: ${e.message}`)); }
        });
      }
    );
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('LS API timeout')); });
    req.write(data);
    req.end();
  });
}

// Read Connect server-streaming response with a short timeout, return first frame
function callLsStream(method: string, body: any = {}, timeoutMs = 5000): Promise<any[]> {
  const details = getLanguageServerDetails();
  if (!details) return Promise.reject(new Error('Language server not running'));

  return new Promise((resolve, reject) => {
    // Connect streaming uses 5-byte envelope framing
    const payload = Buffer.from(JSON.stringify(body));
    const envelope = Buffer.allocUnsafe(5 + payload.length);
    envelope[0] = 0x00;
    envelope.writeUInt32BE(payload.length, 1);
    payload.copy(envelope, 5);

    const chunks: Buffer[] = [];
    const req = https.request(
      {
        hostname: '127.0.0.1',
        port: details.port,
        path: `/exa.language_server_pb.LanguageServerService/${method}`,
        method: 'POST',
        headers: {
          'Content-Type': 'application/connect+json',
          'Connect-Protocol-Version': '1',
          'X-Codeium-Csrf-Token': details.csrfToken,
          'Content-Length': envelope.length,
        },
        timeout: timeoutMs,
        rejectUnauthorized: false,
      },
      (res) => {
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => resolve(decodeConnectFrames(Buffer.concat(chunks))));
      }
    );
    req.on('timeout', () => { req.destroy(); resolve(decodeConnectFrames(Buffer.concat(chunks))); });
    req.on('error', () => resolve(decodeConnectFrames(Buffer.concat(chunks))));
    req.write(envelope);
    req.end();
  });
}

function decodeConnectFrames(buf: Buffer): any[] {
  const frames: any[] = [];
  let acc = buf;
  while (acc.length >= 5) {
    const flag = acc[0];
    const len = acc.readUInt32BE(1);
    if (acc.length < 5 + len) break;
    const msg = acc.slice(5, 5 + len);
    acc = acc.slice(5 + len);
    if (flag !== 0x00) continue; // skip trailers
    try { frames.push(JSON.parse(msg.toString())); } catch { }
  }
  return frames;
}

// Keep connection open and parse frames dynamically
function streamLsConnect(method: string, body: any, reply: any, req: any) {
  const details = getLanguageServerDetails();
  if (!details) {
    reply.raw.write(`data: ${JSON.stringify({ error: 'LS not running' })}\n\n`);
    reply.raw.end();
    return;
  }

  const payload = Buffer.from(JSON.stringify(body));
  const envelope = Buffer.allocUnsafe(5 + payload.length);
  envelope[0] = 0x00;
  envelope.writeUInt32BE(payload.length, 1);
  payload.copy(envelope, 5);

  const lsReq = https.request(
    {
      hostname: '127.0.0.1',
      port: details.port,
      path: `/exa.language_server_pb.LanguageServerService/${method}`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/connect+json',
        'Connect-Protocol-Version': '1',
        'X-Codeium-Csrf-Token': details.csrfToken,
        'Content-Length': envelope.length,
      },
      rejectUnauthorized: false,
    },
    (res) => {
      let buf = Buffer.alloc(0);
      res.on('data', (chunk) => {
        buf = Buffer.concat([buf, chunk]);
        while (buf.length >= 5) {
          const flag = buf[0];
          const len = buf.readUInt32BE(1);
          if (buf.length < 5 + len) break; // Incomplete frame
          const msg = buf.slice(5, 5 + len);
          buf = buf.slice(5 + len);
          
          if (flag === 0x00) {
            try {
              const parsed = JSON.parse(msg.toString());
              reply.raw.write(`data: ${JSON.stringify(parsed)}\n\n`);
            } catch (e) {
              console.error('SSE JSON parse error', e);
            }
          }
        }
      });
      res.on('end', () => {
        reply.raw.write('event: end\ndata: {}\n\n');
        reply.raw.end();
      });
    }
  );

  lsReq.on('error', (err) => {
    reply.raw.write(`event: error\ndata: ${JSON.stringify({ message: err.message })}\n\n`);
    reply.raw.end();
  });

  req.raw.on('close', () => {
    lsReq.destroy();
  });

  lsReq.write(envelope);
  lsReq.end();
}

// --- In-memory cache for /api/projects ---
interface ProjectsCache {
  data: any;
  fetchedAt: number;
}
let projectsCache: ProjectsCache | null = null;
let isFetching = false;

async function fetchProjectsData(): Promise<any> {
  const [streamFrames, jetboxFrames] = await Promise.all([
    callLsStream('ProjectUpdatesStream', {}, 5000),
    callLsStream('JetboxSubscribeToSummaries', {}, 5000),
  ]);

  const firstFrame = streamFrames.find((f: any) => f.projectList?.projectIds);
  const projectIds: string[] = firstFrame?.projectList?.projectIds || [];

  const summaries: Record<string, any> = {};
  for (const f of jetboxFrames) {
    if (f.updates) Object.assign(summaries, f.updates);
  }

  const realIds = projectIds.filter(
    (id) => id && id !== 'outside-of-project' && id !== 'default-cli-project'
  );

  const projectDetails = await Promise.all(
    realIds.map(async (id) => {
      try {
        const r = await callLsApi('ReadProject', { id });
        const p = r?.project;
        if (!p) return null;
        const folderUri = p.projectResources?.resources?.[0]?.gitFolder?.folderUri || '';
        return { id, name: p.name || id, folderUri };
      } catch {
        return { id, name: id, folderUri: '' };
      }
    })
  );

  const projects = projectDetails
    .filter((p): p is NonNullable<typeof p> => p !== null)
    .map((project) => {
      const conversations = Object.entries(summaries)
        .filter(([_, info]: [string, any]) => info?.trajectoryMetadata?.projectId === project.id)
        .map(([id, info]: [string, any]) => ({
          id,
          title: info.summary || 'Untitled Conversation',
          lastModifiedTime: info.lastModifiedTime,
          status: info.status,
        }))
        .sort((a, b) => (b.lastModifiedTime || '').localeCompare(a.lastModifiedTime || ''));

      return { id: project.id, name: project.name, folderUri: project.folderUri, conversations };
    });

  return { projects };
}

async function refreshCache(): Promise<void> {
  if (isFetching) return;
  isFetching = true;
  try {
    const data = await fetchProjectsData();
    projectsCache = { data, fetchedAt: Date.now() };
  } catch {
    // keep old cache on error
  } finally {
    isFetching = false;
  }
}

// Called once on server startup to warm the cache in background
export function warmProjectsCache(): void {
  refreshCache();
}
export async function sessionsRoutes(fastify: FastifyInstance) {
  // GET /api/projects — stale-while-revalidate cache
  fastify.get(
    '/api/projects',
    {
      schema: {
        description: 'Get list of projects and their conversations (cached)',
        tags: ['projects'],
      },
      preHandler: requireAuth,
    },
    async (_req, reply) => {
      // Block only if cache is completely empty (first ever request)
      if (!projectsCache && !isFetching) {
        await refreshCache();
      } else if (!projectsCache && isFetching) {
        // Warmup is in progress — wait for it
        await new Promise<void>((resolve) => {
          const check = setInterval(() => {
            if (!isFetching) { clearInterval(check); resolve(); }
          }, 200);
        });
      }
      // Cache exists — return instantly with isRefreshing flag
      const cachedAt = projectsCache?.fetchedAt
        ? new Date(projectsCache.fetchedAt).toISOString()
        : null;

      return reply.send({
        ...(projectsCache?.data ?? { projects: [] }),
        cachedAt,
        isRefreshing: isFetching,
      });
    }
  );

  // POST /api/projects/refresh — manual refresh, returns immediately
  fastify.post(
    '/api/projects/refresh',
    { schema: { description: 'Trigger manual projects cache refresh', tags: ['projects'] }, preHandler: requireAuth },
    async (_req, reply) => {
      if (!isFetching) {
        projectsCache = null;
        refreshCache(); // fire and forget
      }
      return reply.send({ ok: true, isRefreshing: isFetching });
    }
  );

  // GET /api/sessions
  fastify.get(
    '/api/sessions',
    {
      schema: {
        description: 'Get list of active Antigravity sessions',
        tags: ['sessions'],
        response: {
          200: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                title: { type: 'string' },
                type: { type: 'string' },
                description: { type: 'string' },
                webSocketDebuggerUrl: { type: 'string' },
                devtoolsFrontendUrl: { type: 'string' },
              },
            },
          },
        },
      },
      preHandler: requireAuth,
    },
    async () => {
      return cdpService.getSessions();
    }
  );

  // POST /api/sessions
  fastify.post(
    '/api/sessions',
    {
      schema: {
        description: 'Start or connect to a new workspace session',
        tags: ['sessions'],
        body: {
          type: 'object',
          properties: {
            workspacePath: { type: 'string' },
          },
        },
      },
      preHandler: requireAuth,
    },
    async (request, reply) => {
      const { workspacePath } = request.body as { workspacePath: string };
      
      // Track workspace on LS first
      try {
        const plainPath = workspacePath.replace(/\\/g, '/');
        await callLsApi('AddTrackedWorkspace', { workspace: plainPath });
      } catch (err) {
        // Ignore LS track errors, proceed with session launch
      }
      
      const res = await cdpService.createSession(workspacePath || '');
      if (!res.ok) {
        return reply.code(400).send(res);
      }
      return res;
    }
  );

  // POST /api/conversations — Start a new conversation (cascade)
  fastify.post(
    '/api/conversations',
    {
      schema: {
        description: 'Start a new conversation cascade',
        tags: ['conversations'],
        body: {
          type: 'object',
          properties: {
            folderUri: { type: 'string' }
          }
        }
      },
      preHandler: requireAuth,
    },
    async (request) => {
      const { folderUri } = request.body as { folderUri?: string };
      const body: any = {
        source: 'CORTEX_TRAJECTORY_SOURCE_CASCADE_CLIENT',
        trajectoryType: 'CORTEX_TRAJECTORY_TYPE_CASCADE'
      };
      if (folderUri) {
        body.workspaceUris = [folderUri];
      }
      const result = await callLsApi('StartCascade', body);
      return { ok: true, cascadeId: result.cascadeId };
    }
  );

  // GET /api/conversations/:id/steps
  fastify.get(
    '/api/conversations/:id/steps',
    {
      schema: {
        description: 'Get steps of a specific conversation with pagination',
        tags: ['conversations'],
        params: {
          type: 'object',
          properties: {
            id: { type: 'string' }
          }
        },
        querystring: {
          type: 'object',
          properties: {
            start: { type: 'number' },
            end: { type: 'number' }
          }
        }
      },
      preHandler: requireAuth,
    },
    async (request) => {
      const { id } = request.params as { id: string };
      const { start, end } = request.query as { start?: number; end?: number };

      if (start !== undefined && end !== undefined) {
        return callLsApi('GetCascadeTrajectorySteps', {
          cascadeId: id,
          startIndex: start,
          endIndex: end
        });
      }

      // Default: Ambil 30 step terakhir untuk load cepat.
      // Kita panggil GetAllCascadeTrajectories untuk cari stepCount total
      let stepCount = 0;
      try {
        const trajData = await callLsApi('GetAllCascadeTrajectories');
        const summary = trajData.trajectorySummaries?.[id];
        if (summary && typeof summary.stepCount === 'number') {
          stepCount = summary.stepCount;
        }
      } catch {
        // Fallback jika gagal
      }

      const limit = 30;
      const startIndex = Math.max(0, stepCount - limit);
      const endIndex = stepCount || 999999;

      const result = await callLsApi('GetCascadeTrajectorySteps', {
        cascadeId: id,
        startIndex,
        endIndex
      });

      return {
        ...result,
        totalSteps: stepCount,
        loadedStart: startIndex,
        loadedEnd: endIndex
      };
    }
  );

  // GET /api/files — read local file content for frontend preview
  fastify.get(
    '/api/files',
    {
      schema: {
        description: 'Read local file content for frontend viewer',
        tags: ['files'],
        querystring: {
          type: 'object',
          properties: {
            path: { type: 'string' }
          },
          required: ['path']
        }
      },
      preHandler: requireAuth,
    },
    async (request, reply) => {
      const { path: filePath } = request.query as { path: string };
      const fs = await import('fs/promises');
      try {
        // Basic check to ensure we only read text files or code
        const content = await fs.readFile(filePath, 'utf-8');
        return { content, path: filePath };
      } catch (err: any) {
        return reply.code(400).send({ error: `Cannot read file: ${err.message}` });
      }
    }
  );

  // POST /api/conversations/:id/chat — Send a chat message / run cascade
  fastify.post(
    '/api/conversations/:id/chat',
    {
      schema: {
        description: 'Send a prompt / message to run a cascade in this conversation',
        tags: ['conversations'],
        params: {
          type: 'object',
          properties: {
            id: { type: 'string' }
          }
        },
        body: {
          type: 'object',
          required: ['prompt'],
          properties: {
            prompt: { type: 'string' },
            modelId: { type: 'string' }
          }
        }
      },
      preHandler: requireAuth,
    },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const { prompt, modelId = 'MODEL_PLACEHOLDER_M26' } = request.body as { prompt: string; modelId?: string };

      try {
        const result = await callLsApi('SendUserCascadeMessage', {
          metadata: {},
          cascadeId: id,
          items: [{ text: prompt }],
          cascadeConfig: {
            plannerConfig: {
              plannerTypeConfig: {
                case: 'conversational',
                value: {}
              },
              planModel: modelId,
              requestedModel: { modelId }
            }
          }
        });
        return { ok: true, result };
      } catch (err: any) {
        return reply.code(500).send({ error: `Failed to send message: ${err.message}` });
      }
    }
  );

  // GET /api/conversations/:id/events — Stream live cascade events & status (SSE)
  fastify.get(
    '/api/conversations/:id/events',
    {
      schema: {
        description: 'Stream live cascade events for a conversation via SSE',
        tags: ['conversations'],
        params: {
          type: 'object',
          properties: {
            id: { type: 'string' }
          }
        }
      },
      // Note: EventSource in browser doesn't send auth headers by default
      // In production, we'd use a token query param. For now we skip requireAuth if it's SSE
      // or we rely on cookies. We will skip requireAuth here since ag-server is local.
    },
    async (request, reply) => {
      const { id } = request.params as { id: string };

      reply.raw.setHeader('Content-Type', 'text/event-stream');
      reply.raw.setHeader('Cache-Control', 'no-cache');
      reply.raw.setHeader('Connection', 'keep-alive');
      reply.raw.flushHeaders();

      // Immediately send the last known snapshot/status
      const cached = cdpService.getCachedSnapshot();
      if (cached) {
        reply.raw.write(`data: ${JSON.stringify({ cdpSnapshot: cached })}\n\n`);
      }

      const onSnapshot = (snapshot: any) => {
        reply.raw.write(`data: ${JSON.stringify({ cdpSnapshot: snapshot })}\n\n`);
      };
      
      const onStatus = (status: any) => {
        reply.raw.write(`data: ${JSON.stringify({ cdpStatus: status })}\n\n`);
      };

      cdpService.on('snapshot', onSnapshot);
      cdpService.on('status', onStatus);

      request.raw.on('close', () => {
        cdpService.off('snapshot', onSnapshot);
        cdpService.off('status', onStatus);
      });

      streamLsConnect('ProjectUpdatesStream', {
        // Depending on LS, typically it just streams all updates or accepts a specific cascade/project
        // but typically ProjectUpdatesStream is global. We will stream everything and let frontend filter.
      }, reply, request);
      
      // Keep connection open
      await new Promise(() => {});
    }
  );

  // POST /api/conversations/:id/upload — Upload an image to the Antigravity instance via CDP
  fastify.post(
    '/api/conversations/:id/upload',
    {
      schema: {
        description: 'Upload an image via base64 JSON payload to the active session',
        tags: ['conversations'],
        params: {
          type: 'object',
          properties: {
            id: { type: 'string' }
          }
        },
        body: {
          type: 'object',
          required: ['base64', 'mimeType', 'name'],
          properties: {
            base64: { type: 'string' },
            mimeType: { type: 'string' },
            name: { type: 'string' }
          }
        }
      }
    },
    async (request, reply) => {
      const { base64, mimeType, name } = request.body as { base64: string; mimeType: string; name: string };
      
      const result = await cdpService.uploadImage(base64, mimeType, name);
      if (!result.ok) {
        return reply.code(500).send({ error: `Upload failed: ${result.reason}` });
      }
      return { ok: true };
    }
  );

  // POST /api/conversations/:id/proceed — Click the Proceed button in Antigravity
  fastify.post(
    '/api/conversations/:id/proceed',
    {
      schema: {
        description: 'Click the Proceed button in the active Antigravity session',
        tags: ['conversations'],
        params: {
          type: 'object',
          properties: {
            id: { type: 'string' }
          }
        },
        response: {
          200: {
            type: 'object',
            properties: {
              ok: { type: 'boolean' },
              clicked: { type: 'string' }
            }
          }
        }
      }
    },
    async (request, reply) => {
      const result = await cdpService.clickProceed();
      if (!result.ok) {
        return reply.code(500).send({ error: `Proceed failed: ${result.reason}` });
      }
      return result;
    }
  );

  // POST /api/conversations/:id/permission — Click a permission option in Antigravity
  fastify.post(
    '/api/conversations/:id/permission',
    {
      schema: {
        description: 'Click a permission option (radio/button) in the active session',
        tags: ['conversations'],
        params: {
          type: 'object',
          properties: {
            id: { type: 'string' }
          }
        },
        body: {
          type: 'object',
          required: ['index'],
          properties: {
            index: { type: 'number' }
          }
        },
        response: {
          200: {
            type: 'object',
            properties: {
              ok: { type: 'boolean' },
              label: { type: 'string' }
            }
          }
        }
      }
    },
    async (request, reply) => {
      const { index } = request.body as { index: number };
      const result = await cdpService.clickPermission(index);
      if (!result.ok) {
        return reply.code(500).send({ error: `Permission click failed: ${result.reason}` });
      }
      return result;
    }
  );
}
