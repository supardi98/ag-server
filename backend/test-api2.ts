import { getAccessTokenFromRefresh } from './src/services/oauth.js';
import { fetchProjectIdAndTier } from './src/services/quota.js';
import { db } from './src/services/db.js';

async function run() {
  const account = db.prepare('SELECT * FROM accounts WHERE is_active = 1 LIMIT 1').get() as any;
  const tokenData = await getAccessTokenFromRefresh(account.refresh_token);
  const accessToken = tokenData.access_token;
  
  const { projectId } = await fetchProjectIdAndTier(accessToken);
  console.log('Project ID:', projectId);
  
  const body = {
    contents: [{ role: 'user', parts: [{ text: 'Hello' }] }]
  };
  
  // Try 5: Vertex AI
  const res = await fetch(`https://us-central1-aiplatform.googleapis.com/v1/projects/${projectId}/locations/us-central1/publishers/google/models/gemini-1.5-pro:generateContent`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });
  console.log('Test 5 (Vertex AI):', res.status, await res.text());
}

run().catch(console.error);
