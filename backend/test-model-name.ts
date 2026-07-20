import { getAccessTokenFromRefresh } from './src/services/oauth.js';
import { fetchProjectIdAndTier } from './src/services/quota.js';
import { db } from './src/services/db.js';

async function run() {
  const account = db.prepare('SELECT * FROM accounts WHERE is_active = 1 LIMIT 1').get() as any;
  const tokenData = await getAccessTokenFromRefresh(account.refresh_token);
  const accessToken = tokenData.access_token;
  
  const { projectId } = await fetchProjectIdAndTier(accessToken);
  
  const payloadsToTest = [
    { name: 'no-prefix', payload: { project: projectId, request: { model: 'gemini-1.5-pro', contents: [{ role: 'user', parts: [{ text: 'Hello' }] }] } } },
    { name: 'models-prefix', payload: { project: projectId, request: { model: 'models/gemini-1.5-pro', contents: [{ role: 'user', parts: [{ text: 'Hello' }] }] } } },
    { name: 'publishers-prefix', payload: { project: projectId, request: { model: 'publishers/google/models/gemini-1.5-pro', contents: [{ role: 'user', parts: [{ text: 'Hello' }] }] } } },
  ];
  
  for (const test of payloadsToTest) {
    const res = await fetch('https://cloudcode-pa.googleapis.com/v1internal:generateContent', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(test.payload)
    });
    console.log(`Test ${test.name}:`, res.status, (await res.text()).substring(0, 300));
  }
}

run().catch(console.error);
