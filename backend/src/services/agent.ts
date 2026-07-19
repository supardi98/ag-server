import { spawn, execSync, ChildProcess } from 'child_process';
import { EventEmitter } from 'events';
import { dbService } from './db.js';

export interface AgentStatus {
  running: boolean;
  pid: number | null;
  startedAt: string | null;
  path: string;
  port: number;
}

class AgentService extends EventEmitter {
  private process: ChildProcess | null = null;
  private startedAt: string | null = null;

  private getPath(): string {
    return dbService.getSetting('antigravity_path') || 'antigravity';
  }

  private getPort(): number {
    return parseInt(dbService.getSetting('antigravity_port') || '9000', 10);
  }

  // Helper to find pid of running antigravity with correct port in OS
  private findActivePid(port: number): number | null {
    try {
      const pgrepOutput = execSync('pgrep -f "antigravity"').toString().split('\n').filter(Boolean);
      for (const pidStr of pgrepOutput) {
        const pid = parseInt(pidStr, 10);
        if (pid === process.pid) continue;
        try {
          const cmdLine = execSync(`ps -o args= -p ${pid}`).toString().trim();
          if (cmdLine.includes(`--remote-debugging-port=${port}`)) {
            return pid;
          }
        } catch {
          // Ignore
        }
      }
    } catch {
      // pgrep exits with 1 if no process found
    }
    return null;
  }

  constructor() {
    super();
    // Poll the OS process list every 2 seconds to check if Antigravity exited outside our code
    let lastRunningState = false;
    setInterval(() => {
      const currentStatus = this.status();
      if (currentStatus.running !== lastRunningState) {
        lastRunningState = currentStatus.running;
        this.emit('status-change', currentStatus);
      }
    }, 2000);
  }

  status(): AgentStatus {
    const port = this.getPort();
    const activePid = this.findActivePid(port);
    const isSystemRunning = activePid !== null;

    return {
      running: isSystemRunning,
      pid: activePid,
      startedAt: isSystemRunning ? (this.startedAt || new Date().toISOString()) : null,
      path: this.getPath(),
      port: port,
    };
  }

  // Method to check and kill processes matching 'antigravity' without the correct port parameter
  private cleanupIncorrectProcesses(port: number) {
    try {
      this.emit('log', `[ag-server] Checking for running Antigravity processes...\n`);
      const pgrepOutput = execSync('pgrep -f "antigravity"').toString().split('\n').filter(Boolean);

      for (const pidStr of pgrepOutput) {
        const pid = parseInt(pidStr, 10);
        if (pid === process.pid) continue;

        try {
          const cmdLine = execSync(`ps -o args= -p ${pid}`).toString().trim();
          const hasPortParam = cmdLine.includes(`--remote-debugging-port=${port}`);

          if (!hasPortParam) {
            this.emit('log', `[ag-server] Killing incorrect Antigravity process (PID ${pid}: ${cmdLine})\n`);
            process.kill(pid, 'SIGKILL');
          }
        } catch {
          // Process might have exited already
        }
      }
    } catch {
      // pgrep exits with 1 if no processes found
    }
  }

  start(): { ok: boolean; message: string } {
    const port = this.getPort();
    const activePid = this.findActivePid(port);

    if (activePid !== null) {
      return { ok: false, message: `Antigravity is already running globally with PID ${activePid}.` };
    }

    const execPath = this.getPath();

    // Kill any existing instances running without the debug port argument
    this.cleanupIncorrectProcesses(port);

    this.emit('log', `[ag-server] Starting: ${execPath} --remote-debugging-port=${port}\n`);

    this.process = spawn(execPath, [`--remote-debugging-port=${port}`], {
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: false,
      detached: true,
      env: { ...process.env },
    });

    this.process.unref();

    this.startedAt = new Date().toISOString();

    this.process.stdout?.on('data', (data: Buffer) => {
      this.emit('log', data.toString());
    });

    this.process.stderr?.on('data', (data: Buffer) => {
      this.emit('log', data.toString());
    });

    this.process.on('exit', (code, signal) => {
      this.emit('log', `[ag-server] Process exited (code=${code}, signal=${signal})\n`);
      this.process = null;
      this.startedAt = null;
      this.emit('status-change', this.status());
    });

    this.process.on('error', (err) => {
      this.emit('log', `[ag-server] Error: ${err.message}\n`);
      this.process = null;
      this.startedAt = null;
      this.emit('status-change', this.status());
    });

    this.emit('status-change', this.status());
    return { ok: true, message: `Started with PID ${this.process.pid}` };
  }

  stop(): { ok: boolean; message: string } {
    const port = this.getPort();
    const activePid = this.findActivePid(port);

    if (activePid === null) {
      return { ok: false, message: 'Antigravity is not running.' };
    }

    this.emit('log', `[ag-server] Stopping Antigravity process PID ${activePid}...\n`);
    try {
      process.kill(activePid, 'SIGTERM');
      this.process = null;
      this.startedAt = null;
      return { ok: true, message: `Sent SIGTERM to PID ${activePid}` };
    } catch (err: any) {
      return { ok: false, message: `Failed to stop: ${err.message}` };
    }
  }
}

export const agentService = new AgentService();
