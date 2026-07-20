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
    const body = req.body as any;
    
    const proxyAccount = db.prepare('SELECT * FROM accounts WHERE is_active = 1 LIMIT 1').get() as any;
    if (!proxyAccount || !proxyAccount.refresh_token) {
      return reply.status(500).send({
        error: { message: 'No active proxy account configured in backend.', type: 'internal_server_error' }
      });
    }

    try {
      const tokenData = await getAccessTokenFromRefresh(proxyAccount.refresh_token);
      const accessToken = tokenData.access_token;
      const { projectId } = await fetchProjectIdAndTier(accessToken);
      
      let targetModel = body.model || 'gemini-2.5-flash';
      if (targetModel.includes('davinci') || targetModel.includes('gpt')) {
        targetModel = 'gemini-2.5-flash'; 
      }

      const promptText = typeof body.prompt === 'string' ? body.prompt : (Array.isArray(body.prompt) ? body.prompt.join('') : '');
      const contents = [{ role: 'user', parts: [{ text: promptText }] }];

      const geminiPayload: any = { 
        request: { contents },
        model: targetModel,
        project: projectId,
      };

      const upstreamUrl = `https://daily-cloudcode-pa.sandbox.googleapis.com/v1internal:generateContent`;
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
          error: { message: `Upstream API Error: ${data?.error?.message || 'Unknown'}`, type: 'api_error' }
        });
      }

      const candidates = data.response?.candidates || data.candidates;
      const responseText = candidates?.[0]?.content?.parts?.map((p: any) => p.text).join('') || '';

      const usageMetadata = data.response?.usageMetadata || data.usageMetadata;
      
      return {
        id: 'cmpl-' + Date.now(),
        object: 'text_completion',
        created: Math.floor(Date.now() / 1000),
        model: body.model || 'text-davinci-003',
        choices: [
          {
            text: responseText,
            index: 0,
            logprobs: null,
            finish_reason: 'stop'
          }
        ],
        usage: {
          prompt_tokens: usageMetadata?.promptTokenCount || 0,
          completion_tokens: usageMetadata?.candidatesTokenCount || 0,
          total_tokens: usageMetadata?.totalTokenCount || 0
        }
      };
    } catch (err: any) {
      fastify.log.error('Upstream Request Failed:', err);
      return reply.status(500).send({
        error: { message: `Failed to connect to upstream API: ${err.message}`, type: 'api_error' }
      });
    }
  });

  fastify.post('/v1/responses', { preHandler: requireProxyAuth }, async (req, reply) => {
    const body = req.body as any;
    
    const proxyAccount = db.prepare('SELECT * FROM accounts WHERE is_active = 1 LIMIT 1').get() as any;
    if (!proxyAccount || !proxyAccount.refresh_token) {
      return reply.status(500).send({
        error: { message: 'No active proxy account configured in backend.', type: 'internal_server_error' }
      });
    }

    try {
      const tokenData = await getAccessTokenFromRefresh(proxyAccount.refresh_token);
      const accessToken = tokenData.access_token;
      const { projectId } = await fetchProjectIdAndTier(accessToken);
      
      let targetModel = body.model || 'gemini-2.5-flash';
      if (targetModel.includes('gpt') || targetModel.includes('claude')) {
        targetModel = 'gemini-2.5-flash';
      }

      // Convert Codex input to Gemini contents
      const contents = (body.input || []).map((msg: any) => {
        let textPart = '';
        if (typeof msg.content === 'string') {
          textPart = msg.content;
        } else if (Array.isArray(msg.content)) {
          textPart = msg.content.map((c: any) => c.text || c.output_text || '').join('');
        }
        return {
          role: msg.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: textPart }]
        };
      });

      const geminiPayload: any = { 
        request: { contents },
        model: targetModel,
        project: projectId,
      };

      if (body.instructions) {
        geminiPayload.request.systemInstruction = {
          role: 'user',
          parts: [{ text: body.instructions }]
        };
      }

      const upstreamUrl = `https://daily-cloudcode-pa.sandbox.googleapis.com/v1internal:generateContent`;
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
          error: { message: `Upstream API Error: ${data?.error?.message || 'Unknown'}`, type: 'api_error' }
        });
      }

      const candidates = data.response?.candidates || data.candidates;
      const responseText = candidates?.[0]?.content?.parts?.map((p: any) => p.text).join('') || '';

      const usageMetadata = data.response?.usageMetadata || data.usageMetadata;
      
      return {
        type: 'response',
        id: 'resp_' + Date.now(),
        status: 'completed',
        output: [
          {
            type: 'message',
            role: 'assistant',
            content: responseText
          }
        ],
        usage: {
          input_tokens: usageMetadata?.promptTokenCount || 0,
          output_tokens: usageMetadata?.candidatesTokenCount || 0,
          total_tokens: usageMetadata?.totalTokenCount || 0
        }
      };
    } catch (err: any) {
      fastify.log.error('Upstream Request Failed:', err);
      return reply.status(500).send({
        error: { message: `Failed to connect to upstream API: ${err.message}`, type: 'api_error' }
      });
    }
  });

  fastify.post('/v1/messages', { preHandler: requireProxyAuth }, async (req, reply) => {
    const body = req.body as any;
    
    const proxyAccount = db.prepare('SELECT * FROM accounts WHERE is_active = 1 LIMIT 1').get() as any;
    if (!proxyAccount || !proxyAccount.refresh_token) {
      return reply.status(500).send({
        error: { message: 'No active proxy account configured in backend.', type: 'internal_server_error' }
      });
    }

    try {
      const tokenData = await getAccessTokenFromRefresh(proxyAccount.refresh_token);
      const accessToken = tokenData.access_token;
      const { projectId } = await fetchProjectIdAndTier(accessToken);
      
      let targetModel = body.model || 'gemini-2.5-flash';
      if (targetModel.includes('claude') || targetModel.includes('gpt')) {
        targetModel = 'gemini-2.5-flash'; // fallback map
      }

      const contents = (body.messages || []).map((msg: any) => ({
        role: msg.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: typeof msg.content === 'string' ? msg.content : msg.content?.[0]?.text || '' }]
      }));

      const geminiPayload: any = { 
        request: { contents },
        model: targetModel,
        project: projectId,
      };

      if (body.system) {
        geminiPayload.request.systemInstruction = {
          role: 'user',
          parts: [{ text: body.system }]
        };
      }

      const upstreamUrl = `https://daily-cloudcode-pa.sandbox.googleapis.com/v1internal:generateContent`;
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
          error: { message: `Upstream API Error: ${data?.error?.message || 'Unknown'}`, type: 'api_error' }
        });
      }

      const candidates = data.response?.candidates || data.candidates;
      const responseText = candidates?.[0]?.content?.parts?.map((p: any) => p.text).join('') || '';

      const usageMetadata = data.response?.usageMetadata || data.usageMetadata;
      
      return {
        id: 'msg_' + Date.now(),
        type: 'message',
        role: 'assistant',
        model: body.model || 'claude-3-5-sonnet',
        content: [
          {
            type: 'text',
            text: responseText
          }
        ],
        stop_reason: 'end_turn',
        stop_sequence: null,
        usage: {
          input_tokens: usageMetadata?.promptTokenCount || 0,
          output_tokens: usageMetadata?.candidatesTokenCount || 0
        }
      };
    } catch (err: any) {
      fastify.log.error('Upstream Request Failed:', err);
      return reply.status(500).send({
        error: { message: `Failed to connect to upstream API: ${err.message}`, type: 'api_error' }
      });
    }
  });

  fastify.post('/v1beta/models/:model:generateContent', { preHandler: requireProxyAuth }, async (req, reply) => {
    const { model } = req.params as any;
    const body = req.body as any;
    
    const proxyAccount = db.prepare('SELECT * FROM accounts WHERE is_active = 1 LIMIT 1').get() as any;
    if (!proxyAccount || !proxyAccount.refresh_token) {
      return reply.status(500).send({
        error: { message: 'No active proxy account configured in backend.', type: 'internal_server_error' }
      });
    }

    try {
      const tokenData = await getAccessTokenFromRefresh(proxyAccount.refresh_token);
      const accessToken = tokenData.access_token;
      const { projectId } = await fetchProjectIdAndTier(accessToken);
      
      let targetModel = model || 'gemini-2.5-flash';
      if (targetModel.includes('gpt-4') || targetModel.includes('gpt-3.5') || targetModel === 'antigravity-local') {
        targetModel = 'gemini-2.5-flash';
      }

      const geminiPayload: any = { 
        request: body,
        model: targetModel,
        project: projectId,
      };

      const upstreamUrl = `https://daily-cloudcode-pa.sandbox.googleapis.com/v1internal:generateContent`;
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
        return reply.status(response.status).send(data);
      }

      // Return exactly what upstream returned
      return data;
    } catch (err: any) {
      fastify.log.error('Upstream Request Failed:', err);
      return reply.status(500).send({
        error: { message: `Failed to connect to upstream API: ${err.message}`, status: 'INTERNAL' }
      });
    }
  });
}
