import { getAccessTokenFromRefresh } from './src/services/oauth.js';
import { fetchProjectIdAndTier, fetchLiveQuota } from './src/services/quota.js';
import { db } from './src/services/db.js';

async function run() {
  const account = db.prepare('SELECT * FROM accounts WHERE is_active = 1 LIMIT 1').get() as any;
  const data = await fetchLiveQuota(account.refresh_token);
  // fetchLiveQuota uses getAccessTokenFromRefresh inside, wait no it doesn't.
  const tokenData = await getAccessTokenFromRefresh(account.refresh_token);
  const quota = await fetchLiveQuota(tokenData.access_token);
  
  console.log("Found models:", quota.models.map(m => m.id));
}

run().catch(console.error);
