import { FastifyInstance } from 'fastify';
import { config } from '../config/env.js';
import { db } from '../services/db.js';
import { getAccessTokenFromRefresh } from '../services/oauth.js';
import { fetchProjectIdAndTier } from '../services/quota.js';

export async function proxyRoutes(fastify: FastifyInstance) {
  // Authentication middleware
  const requireProxyAuth = async (req: any, reply: any) => {
    const authHeader = req.headers.authorization;
    if (config.PROXY_API_KEY && config.PROXY_API_KEY.length > 0) {
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return reply.status(401).send({ error: 'Missing or invalid Authorization header' });
      }
      const token = authHeader.split(' ')[1];
      if (token !== config.PROXY_API_KEY) {
        return reply.status(403).send({ error: 'Invalid API Key' });
      }
    }
  };

  // --- OpenAI to Gemini Adapter ---
  fastify.post('/v1/chat/completions', { preHandler: requireProxyAuth }, async (req, reply) => {
    const body = req.body as any;
    
    // 1. Fetch active account for upstream request
    const proxyAccount = db.prepare('SELECT * FROM accounts WHERE is_active = 1 LIMIT 1').get() as any;
    if (!proxyAccount || !proxyAccount.refresh_token) {
      return reply.status(500).send({
        error: { message: 'No active proxy account configured in backend.', type: 'internal_server_error' }
      });
    }
    const geminiRefreshToken = proxyAccount.refresh_token;

    let accessToken: string;
    let projectId: string | undefined;
    try {
      const tokenData = await getAccessTokenFromRefresh(geminiRefreshToken);
      accessToken = tokenData.access_token;
      const tierInfo = await fetchProjectIdAndTier(accessToken);
      projectId = tierInfo.projectId;
    } catch (err: any) {
      return reply.status(500).send({
        error: { message: `Failed to refresh OAuth token: ${err.message}`, type: 'internal_server_error' }
      });
    }

    // 2. Map OpenAI messages to Gemini format
    const messages = body.messages || [];
    let systemInstruction = null;
    const contents: any[] = [];
    
    for (const msg of messages) {
      if (msg.role === 'system') {
        systemInstruction = { parts: [{ text: msg.content }] };
      } else {
        contents.push({
          role: msg.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: msg.content }]
        });
      }
    }

    // Map generic model name or pass-through
    let targetModel = body.model || 'gemini-2.5-flash';
    if (targetModel.includes('gpt-4') || targetModel.includes('gpt-3.5') || targetModel === 'antigravity-local') {
      targetModel = 'gemini-2.5-flash';
    }

    const geminiPayload: any = { 
      request: {
        contents,
      },
      model: targetModel,
      project: projectId,
    };
    if (systemInstruction) geminiPayload.request.systemInstruction = systemInstruction;

    // Optional configs mapped
    if (body.temperature !== undefined) {
      geminiPayload.request.generationConfig = geminiPayload.request.generationConfig || {};
      geminiPayload.request.generationConfig.temperature = body.temperature;
    }
    


    // 3. Send request to Gemini Upstream
    const upstreamUrl = `https://daily-cloudcode-pa.sandbox.googleapis.com/v1internal:generateContent`;
    
    try {
      const response = await fetch(upstreamUrl, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`,
          'User-Agent': 'Antigravity/4.3.0 (Macintosh; Intel Mac OS X 10_15_7) Chrome/132.0.6834.160 Electron/39.2.3',
          'x-client-name': 'antigravity',
          'x-client-version': '4.3.0'
        },
        body: JSON.stringify(geminiPayload)
      });
      
      const data: any = await response.json();
      
      if (!response.ok) {
        return reply.status(response.status).send({
          error: { message: `Upstream API Error: ${data?.error?.message || 'Unknown'}`, type: 'upstream_error' }
        });
      }

      // 4. Translate back to OpenAI format
      const candidates = data.response?.candidates || data.candidates;
      const responseText = candidates?.[0]?.content?.parts?.map((p: any) => p.text).join('') || '';
      
      return {
        id: 'chatcmpl-' + Date.now(),
        object: 'chat.completion',
        created: Math.floor(Date.now() / 1000),
        model: targetModel,
        choices: [
          {
            index: 0,
            message: {
              role: 'assistant',
              content: responseText
            },
            finish_reason: 'stop'
          }
        ],
        usage: {
          prompt_tokens: (data.response?.usageMetadata || data.usageMetadata)?.promptTokenCount || 0,
          completion_tokens: (data.response?.usageMetadata || data.usageMetadata)?.candidatesTokenCount || 0,
          total_tokens: (data.response?.usageMetadata || data.usageMetadata)?.totalTokenCount || 0
        }
      };
    } catch (err: any) {
      fastify.log.error('Upstream Request Failed:', err);
      return reply.status(500).send({
        error: { message: `Failed to connect to upstream API: ${err.message}`, type: 'network_error' }
      });
    }
  });

  fastify.post('/v1/completions', { preHandler: requireProxyAuth }, async (req, reply) => {
    return { choices: [{ text: 'Response from completions proxy', index: 0, finish_reason: 'stop' }] };
  });

  fastify.post('/v1/responses', { preHandler: requireProxyAuth }, async (req, reply) => {
    return { response: 'Codex response proxy' };
  });

  fastify.post('/v1/messages', { preHandler: requireProxyAuth }, async (req, reply) => {
    return {
      id: 'msg_' + Date.now(), type: 'message', role: 'assistant',
      content: [{ type: 'text', text: '[Antigravity Proxy] Anthropic proxy not yet mapped to upstream' }],
      stop_reason: 'end_turn', usage: { input_tokens: 0, output_tokens: 0 }
    };
  });

  fastify.post('/v1beta/models/:model:generateContent', { preHandler: requireProxyAuth }, async (req, reply) => {
    return {
      candidates: [{ content: { parts: [{ text: '[Antigravity Proxy] Direct Gemini endpoint pass-through not implemented' }], role: 'model' }, finishReason: 'STOP' }]
    };
  });
}
