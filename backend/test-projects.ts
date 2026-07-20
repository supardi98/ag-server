import { cdpService } from './src/services/cdp.js';

async function main() {
  await cdpService.start();
  await new Promise(r => setTimeout(r, 2000));
  
  // Get all projects
  const streamFrames = await cdpService.callLsStream('ProjectUpdatesStream', {}, 5000);
  const firstFrame = streamFrames.find((f: any) => f.projectList?.projectIds);
  const projectIds = firstFrame?.projectList?.projectIds || [];
  
  for (const id of projectIds) {
    if (id === 'outside-of-project' || id === 'default-cli-project') continue;
    const r = await cdpService.callLsApi('ReadProject', { id });
    console.log(`Project ${id}: ${r.project.name}`);
    console.log(`  folderUri: ${r.project.projectResources?.resources?.[0]?.gitFolder?.folderUri}`);
    console.log(`  workspaceFolderAbsoluteUri (if any?): ${r.project.workspaceFolderAbsoluteUri}`);
  }
  
  process.exit(0);
}
main();
