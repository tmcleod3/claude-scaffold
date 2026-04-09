/**
 * Daemon core — re-exports from the daemon-process pattern for wizard runtime use.
 * ARCH-R2-012: Production code should not import from docs/patterns/ directly.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

export {
  writePidFile, checkStalePid, removePidFile,
  generateSessionToken, validateToken,
  createSocketServer, startSocketServer,
  writeState, setupSignalHandlers,
  JobScheduler, createLogger,
  STATE_FILE, SOCKET_PATH, TOKEN_FILE,
} from './patterns/daemon-process.js';
export type { HeartbeatState, DaemonState } from './patterns/daemon-process.js';

/**
 * Check if a global heartbeat daemon is running at ~/.voidforge/run/.
 * ADR-041 La Forge CRITICAL: prevents split-brain when per-project daemon starts.
 */
export async function checkGlobalDaemon(): Promise<boolean> {
  const pidFile = join(homedir(), '.voidforge', 'run', 'heartbeat.pid');
  if (!existsSync(pidFile)) return false;
  try {
    const pid = parseInt(readFileSync(pidFile, 'utf-8').trim(), 10);
    if (isNaN(pid)) return false;
    process.kill(pid, 0); // signal 0 = check if process exists
    return true;
  } catch {
    return false; // process not running, stale PID file
  }
}

/**
 * Configure daemon paths for per-project operation.
 * Overrides module-level constants before daemon starts.
 */
export function configurePaths(projectDir: string): { stateFile: string; socketPath: string; tokenFile: string } {
  const runDir = join(projectDir, 'cultivation', 'run');
  return {
    stateFile: join(runDir, 'heartbeat-state.json'),
    socketPath: join(runDir, 'heartbeat.sock'),
    tokenFile: join(runDir, 'heartbeat.token'),
  };
}
