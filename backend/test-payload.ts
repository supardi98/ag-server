import { getAccessTokenFromRefresh } from './src/services/oauth.js';
import { fetchProjectIdAndTier } from './src/services/quota.js';
import { db } from './src/services/db.js';

async function run() {
  const account = db.prepare('SELECT * FROM accounts WHERE is_active = 1 LIMIT 1').get() as any;
  const tokenData = await getAccessTokenFromRefresh(account.refresh_token);
  const accessToken = tokenData.access_token;
  
  const { projectId } = await fetchProjectIdAndTier(accessToken);
  
  const timestampMs = Date.now();
  const randomHex = Math.random().toString(16).substring(2, 10);
  const officialRequestId = `agent/${timestampMs}/${randomHex}`;
  
  const prefixes = ['gemini-3.5-flash-low'];
  for (const prefix of prefixes) {
    const payload = {
      project: projectId,
      request: {
        contents: [{ role: 'user', parts: [{ text: 'Hello' }] }],
      },
      model: prefix,
      userAgent: 'antigravity',
      requestType: 'agent',
      requestId: officialRequestId
    };
    
    const res = await fetch('https://daily-cloudcode-pa.sandbox.googleapis.com/v1internal:generateContent', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'User-Agent': 'Antigravity/4.3.0 (Macintosh; Intel Mac OS X 10_15_7) Chrome/132.0.6834.160 Electron/39.2.3',
        'x-client-name': 'antigravity',
        'x-client-version': '4.3.0'
      },
      body: JSON.stringify(payload)
    });
    
    const data = await res.json() as any;
    console.log(prefix, res.status, JSON.stringify(data, null, 2));
  }
}

run().catch(console.error);
