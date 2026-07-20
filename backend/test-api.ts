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
  
  // Try 1: generativelanguage without project
  let res = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-pro:generateContent', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });
  console.log('Test 1 (No Project):', res.status, await res.text());
  
  // Try 2: generativelanguage with project
  res = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-pro:generateContent', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      'x-goog-user-project': projectId || ''
    },
    body: JSON.stringify(body)
  });
  console.log('Test 2 (With Project):', res.status, await res.text());

  // Try 3: cloudcode-pa
  res = await fetch('https://cloudcode-pa.googleapis.com/v1internal:generateContent', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ ...body, project: projectId })
  });
  console.log('Test 3 (CloudCode):', res.status, await res.text());

  // Try 4: cloudcode-pa models/generateContent
  res = await fetch('https://cloudcode-pa.googleapis.com/v1internal/models/gemini-1.5-pro:generateContent', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ ...body, project: projectId })
  });
  console.log('Test 4 (CloudCode with model):', res.status, await res.text());
}

run().catch(console.error);
