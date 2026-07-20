import { getAccessTokenFromRefresh } from './src/services/oauth.js';
import { fetchProjectIdAndTier } from './src/services/quota.js';
import { db } from './src/services/db.js';

async function run() {
  const account = db.prepare('SELECT * FROM accounts WHERE is_active = 1 LIMIT 1').get() as any;
  const tokenData = await getAccessTokenFromRefresh(account.refresh_token);
  const accessToken = tokenData.access_token;
  
  const { projectId } = await fetchProjectIdAndTier(accessToken);
  
  const payloadsToTest = [
    { name: 'no-prefix-daily', payload: { project: projectId, request: { model: 'gemini-1.5-pro', contents: [{ role: 'user', parts: [{ text: 'Hello' }] }] } } },
    { name: 'no-prefix-daily-sandbox', payload: { project: projectId, request: { model: 'gemini-1.5-pro', contents: [{ role: 'user', parts: [{ text: 'Hello' }] }] } } },
  ];
  
  const endpoints = [
    'https://daily-cloudcode-pa.googleapis.com/v1internal:generateContent',
    'https://daily-cloudcode-pa.sandbox.googleapis.com/v1internal:generateContent',
    'https://cloudcode-pa.googleapis.com/v1internal/models/gemini-1.5-pro:generateContent', // Maybe it is REST path
  ];
  
  for (const endpoint of endpoints) {
    console.log('Testing endpoint:', endpoint);
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ project: projectId, request: { model: 'gemini-1.5-pro', contents: [{ role: 'user', parts: [{ text: 'Hello' }] }] } })
    });
    console.log(`Result:`, res.status, (await res.text()).substring(0, 300));
  }
}

run().catch(console.error);
