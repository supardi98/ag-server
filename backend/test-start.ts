import { cdpService } from './src/services/cdp.js';

async function main() {
  await cdpService.start();
  await new Promise(r => setTimeout(r, 2000));
  
  const body = {
    source: 'CORTEX_TRAJECTORY_SOURCE_CASCADE_CLIENT',
    trajectoryType: 'CORTEX_TRAJECTORY_TYPE_CASCADE',
    workspaceUris: ['file:///home/supardi/Projects/supardi.net/ag-server']
  };
  
  const result = await cdpService.callLsApi('StartCascade', body);
  console.log("Cascade started:", result.cascadeId);
  
  // Also dump a known good conversation to see its fields
  const trajData = await cdpService.callLsApi('GetAllCascadeTrajectories', {});
  // Look at an old one from ag-server
  const summaries = trajData.trajectorySummaries || {};
  const oldOne = summaries['2c5a05d5-4727-47f0-9d94-10bbed80a9ec'];
  console.log("Old one:", JSON.stringify(oldOne, null, 2));
  
  process.exit(0);
}
main();
