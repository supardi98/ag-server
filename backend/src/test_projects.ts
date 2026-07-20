import { callLsStream } from './services/agent.js';

async function testProjects() {
  console.log('Testing ProjectUpdatesStream...');
  try {
    const streamFrames = await callLsStream('ProjectUpdatesStream', {}, 5000);
    console.log(`Received ${streamFrames.length} frames`);
    const firstFrame = streamFrames.find((f: any) => f.projectList?.projectIds);
    if (firstFrame) {
      console.log('Project IDs:', firstFrame.projectList.projectIds);
    } else {
      console.log('No projectList found in frames');
      console.dir(streamFrames, { depth: null });
    }
  } catch (err) {
    console.error('Error:', err);
  }
}

testProjects();
