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
      try {
        const cmdLine = execSync(`ps -o args= -p ${pid}`).toString().trim();
        const csrfMatch = cmdLine.match(/--csrf_token\s+([a-f0-9-]+)/);
        if (csrfMatch) {
          // Find the TCP listening port for this pid using lsof
          const lsofOutput = execSync(`lsof -iTCP -sTCP:LISTEN -P -n -p ${pid}`).toString();
          const portMatch = lsofOutput.match(/:(\d+)\s+\(LISTEN\)/);
          if (portMatch) {
            return {
              port: parseInt(portMatch[1], 10),
              csrfToken: csrfMatch[1],
            };
          }
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

export async function sessionsRoutes(fastify: FastifyInstance) {
  // GET /api/projects - Fetches projects list and groups their conversations
  fastify.get(
    '/api/projects',
    {
      schema: {
        description: 'Get list of projects and their conversations',
        tags: ['projects'],
      },
      preHandler: requireAuth,
    },
    async () => {
      try {
        // 1. Get all conversations/trajectories from LS
        const summariesData = await callLsApi('GetAllCascadeTrajectories');
        const trajectories = summariesData.trajectorySummaries || {};
        
        // 2. Fetch active projects list from workspaces info
        const workspaceData = await callLsApi('GetWorkspaceInfos');
        const workspaces = workspaceData.workspaceInfos || [];
        
        // Group trajectories by workspace uri
        const projectsList = workspaces.map((ws: any) => {
          const workspaceUri = ws.workspaceUri;
          const decodedUri = decodeURIComponent(workspaceUri);
          const name = decodedUri.replace(/\/+$/, '').split('/').pop() || 'workspace';
          
          const normalize = (u: string) => decodeURIComponent(u || '').toLowerCase().replace(/\/+$/, '');
          const wsUriNorm = normalize(workspaceUri);
          
          // Filter trajectories that contain this workspace
          const projectConversations = Object.entries(trajectories)
            .filter(([_, info]: [string, any]) => {
              const cascadeWsUris = (info.workspaces || []).map((w: any) => w.workspaceFolderAbsoluteUri);
              return cascadeWsUris.some((uri: string) => normalize(uri) === wsUriNorm);
            })
            .map(([id, info]: [string, any]) => ({
              id,
              title: info.summary || 'Untitled Conversation',
              lastModifiedTime: info.lastModifiedTime,
            }));
            
          return {
            name,
            folderUri: workspaceUri,
            conversations: projectConversations,
          };
        });
        
        return { projects: projectsList };
      } catch (err: any) {
        fastify.log.error(err);
        return { projects: [] };
      }
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
}
