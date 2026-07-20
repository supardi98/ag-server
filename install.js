import { spawnSync } from 'child_process';
import { join } from 'path';

const projectRoot = process.cwd();

function runCommand(command, args, cwd) {
  console.log(`\n🤖 Running: ${command} ${args.join(' ')} in ${cwd}...`);
  const result = spawnSync(command, args, { cwd, stdio: 'inherit' });
  if (result.status !== 0) {
    console.error(`❌ Command failed with exit code ${result.status}`);
    process.exit(result.status || 1);
  }
}

// 1. Backend Installation
const backendDir = join(projectRoot, 'backend');
runCommand('npm', ['install'], backendDir);

// 2. Approve scripts for Backend
runCommand('npm', ['install-scripts', 'approve', 'better-sqlite3', 'sqlite3', 'esbuild'], backendDir);

// 3. Rebuild backend (to build sqlite bindings cleanly)
runCommand('npm', ['rebuild'], backendDir);

// 4. Frontend Installation
const frontendDir = join(projectRoot, 'frontend');
runCommand('npm', ['install'], frontendDir);

// 5. Approve scripts for Frontend
runCommand('npm', ['install-scripts', 'approve', 'esbuild'], frontendDir);

console.log('\n✅ All packages installed and native SQLite bindings rebuilt successfully!');
