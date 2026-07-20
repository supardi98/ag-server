const { callLsApi } = require('./backend/dist/services/cdp.js');
async function run() {
  const cdpService = require('./backend/dist/services/cdp.js').cdpService;
  await cdpService.start();
  await new Promise(r => setTimeout(r, 2000));

  // Find a project ID
  const trajData = await require('./backend/dist/services/cdp.js').callLsApi('GetAllCascadeTrajectories', {});
  console.log("Called API");
  process.exit(0);
}
run();
