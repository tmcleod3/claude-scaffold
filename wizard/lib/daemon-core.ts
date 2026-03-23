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
  STATE_FILE, SOCKET_PATH,
} from '../../docs/patterns/daemon-process.js';
export type { HeartbeatState, DaemonState } from '../../docs/patterns/daemon-process.js';
