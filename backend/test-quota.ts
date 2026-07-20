import { getAccessTokenFromRefresh } from './src/services/oauth.js';
import { fetchProjectIdAndTier } from './src/services/quota.js';
import { db } from './src/services/db.js';

async function run() {
  const account = db.prepare('SELECT * FROM accounts WHERE is_active = 1 LIMIT 1').get() as any;
  const tokenData = await getAccessTokenFromRefresh(account.refresh_token);
  const accessToken = tokenData.access_token;
  
  const { projectId } = await fetchProjectIdAndTier(accessToken);
  
  const res = await fetch('https://daily-cloudcode-pa.sandbox.googleapis.com/v1internal:fetchAvailableModels', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ project: projectId })
  });
  const data = await res.json() as any;
  console.log(JSON.stringify(data).substring(0, 500));
}

run().catch(console.error);
