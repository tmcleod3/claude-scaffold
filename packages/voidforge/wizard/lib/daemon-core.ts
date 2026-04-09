/**
 * Daemon core — re-exports from the daemon-process pattern for wizard runtime use.
 * ARCH-R2-012: Production code should not import from docs/patterns/ directly.
 */
export {
  writePidFile, checkStalePid, removePidFile,
  generateSessionToken, validateToken,
  createSocketServer, startSocketServer,
  writeState, setupSignalHandlers,
  JobScheduler, createLogger,
  configurePaths, checkGlobalDaemon,
  STATE_FILE, SOCKET_PATH, TOKEN_FILE,
} from './patterns/daemon-process.js';
export type { HeartbeatState, DaemonState } from './patterns/daemon-process.js';
