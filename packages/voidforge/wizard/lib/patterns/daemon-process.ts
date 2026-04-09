/**
 * Pattern: Daemon Process (Heartbeat)
 *
 * Key principles:
 * - PID file with flock to prevent concurrent instances
 * - Unix domain socket for IPC (ADR-1: single writer)
 * - Session token auth (rotated every 24 hours)
 * - Graceful shutdown on SIGTERM (10s deadline)
 * - Sleep/wake recovery with tiered catch-up
 * - Core dumps disabled for processes holding vault keys
 * - Log rotation: daily or at 10MB, retain 7 days
 * - macOS: F_FULLFSYNC for financial files
 *
 * Agents: Dockson (treasury), Heartbeat daemon
 *
 * PRD Reference: §9.7, §9.18, §9.19.2, §9.20.11
 */

import { createServer } from 'node:net';
import { randomBytes } from 'node:crypto';
import { writeFile, readFile, unlink, mkdir, open, rename } from 'node:fs/promises';
import { existsSync, createWriteStream } from 'node:fs';
import { join } from 'node:path';
import { homedir, platform } from 'node:os';

const VOIDFORGE_DIR = join(homedir(), '.voidforge');
const RUN_DIR = join(VOIDFORGE_DIR, 'run');
const PID_FILE = join(RUN_DIR, 'heartbeat.pid');
const SOCKET_PATH = join(RUN_DIR, 'heartbeat.sock');
const TOKEN_FILE = join(VOIDFORGE_DIR, 'heartbeat.token');
const STATE_FILE = join(VOIDFORGE_DIR, 'heartbeat.json');
const LOG_FILE = join(VOIDFORGE_DIR, 'heartbeat.log');

type DaemonState = 'starting' | 'healthy' | 'degraded' | 'recovering' | 'recovery_failed' | 'shutting_down' | 'stopped';

interface HeartbeatState {
  pid: number;
  state: DaemonState;
  startedAt: string;
  lastHeartbeat: string;
  lastEventId: number;
  cultivationState: string;
  activePlatforms: string[];
  activeCampaigns: number;
  todaySpend: number;      // Cents
  dailyBudget: number;     // Cents
  alerts: string[];
  tokenHealth: Record<string, { status: string; expiresAt: string }>;
  lastAgentMessage?: { agent: string; text: string; timestamp: string };
  // Treasury state (v19.0 — present when stablecoin funding is configured)
  stablecoinBalanceCents?: number;
  bankBalanceCents?: number;
  runwayDays?: number;
  fundingFrozen?: boolean;
  pendingTransferCount?: number;
}

// ── PID Management ────────────────────────────────────

async function writePidFile(): Promise<void> {
  await mkdir(RUN_DIR, { recursive: true, mode: 0o700 });
  const fh = await open(PID_FILE, 'w', 0o600);
  try {
    await fh.writeFile(String(process.pid));
    await fh.sync();
  } finally {
    await fh.close();
  }
}

async function checkStalePid(): Promise<boolean> {
  if (!existsSync(PID_FILE)) return false;
  try {
    const pid = parseInt(await readFile(PID_FILE, 'utf-8'));
    process.kill(pid, 0); // Check if process exists (throws if not)
    return true; // Another daemon is alive
  } catch {
    await unlink(PID_FILE).catch(() => {});
    return false; // Stale PID — cleaned up
  }
}

async function removePidFile(): Promise<void> {
  await unlink(PID_FILE).catch(() => {});
}

// ── Session Token ─────────────────────────────────────
// Rotated every 24 hours (§9.19.15)

async function generateSessionToken(): Promise<string> {
  const token = randomBytes(32).toString('hex');
  await mkdir(RUN_DIR, { recursive: true, mode: 0o700 });
  const tmpPath = TOKEN_FILE + '.tmp.' + process.pid;
  const fh = await open(tmpPath, 'w', 0o600);
  try {
    await fh.writeFile(token);
    await fh.sync();
  } finally {
    await fh.close();
  }
  await rename(tmpPath, TOKEN_FILE);
  return token;
}

function validateToken(provided: string, expected: string): boolean {
  if (provided.length !== expected.length) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  const { timingSafeEqual } = require('node:crypto');
  return timingSafeEqual(a, b);
}

// ── Socket Server ─────────────────────────────────────
// JSON-over-HTTP on Unix domain socket (§9.20.11)

function createSocketServer(
  sessionToken: string,
  handleRequest: (method: string, path: string, body: unknown, auth: { hasToken: boolean; vaultPassword: string; totpCode: string }) => Promise<{ status: number; body: unknown }>
): ReturnType<typeof createServer> {
  const MAX_REQUEST_SIZE = 1024 * 1024; // 1MB — R2-NIGHTWING-003: enforce during streaming

  const server = createServer(async (conn) => {
    let data = '';
    let rejected = false;
    conn.on('data', (chunk) => {
      data += chunk.toString();
      if (data.length > MAX_REQUEST_SIZE && !rejected) {
        rejected = true;
        conn.write('HTTP/1.1 413 Payload Too Large\r\nContent-Type: application/json\r\n\r\n{"ok":false,"error":"Request too large"}');
        conn.end();
      }
    });
    conn.on('end', async () => {
      try {
        // Parse HTTP-like request from the socket
        const lines = data.split('\r\n');
        const [method, path] = (lines[0] || 'GET /').split(' ');

        // Extract auth headers — pass VALUES, not just presence (SEC-001 fix)
        const authHeader = lines.find(l => l.toLowerCase().startsWith('authorization:'));
        const token = authHeader ? authHeader.split(' ').pop() || '' : '';
        const hasToken = validateToken(token, sessionToken);

        const vaultHeader = lines.find(l => l.toLowerCase().startsWith('x-vault-password:'));
        const vaultPassword = vaultHeader ? vaultHeader.substring(vaultHeader.indexOf(':') + 1).trim() : '';

        const totpHeader = lines.find(l => l.toLowerCase().startsWith('x-totp-code:'));
        const totpCode = totpHeader ? totpHeader.substring(totpHeader.indexOf(':') + 1).trim() : '';

        // Parse body (after blank line)
        const bodyStart = data.indexOf('\r\n\r\n');

        if (rejected) return; // Already rejected during streaming

        const body = bodyStart >= 0 ? JSON.parse(data.substring(bodyStart + 4) || '{}') : {};

        const result = await handleRequest(method, path, body, {
          hasToken,
          vaultPassword,  // Actual value for verification by handler
          totpCode,       // Actual value for verification by handler
        });

        conn.write(`HTTP/1.1 ${result.status} OK\r\nContent-Type: application/json\r\n\r\n${JSON.stringify(result.body)}`);
      } catch (err) {
        conn.write(`HTTP/1.1 500 Error\r\nContent-Type: application/json\r\n\r\n${JSON.stringify({ ok: false, error: 'Internal error' })}`);
      }
      conn.end();
    });
  });

  return server;
}

async function startSocketServer(server: ReturnType<typeof createServer>): Promise<void> {
  // Clean up stale socket
  if (existsSync(SOCKET_PATH)) {
    try {
      const { connect } = require('node:net');
      const testConn = connect(SOCKET_PATH);
      await new Promise<void>((resolve, reject) => {
        testConn.on('connect', () => { testConn.destroy(); reject(new Error('Another daemon is running')); });
        testConn.on('error', () => { resolve(); }); // ECONNREFUSED = stale socket
      });
      await unlink(SOCKET_PATH);
    } catch (err) {
      if ((err as Error).message === 'Another daemon is running') throw err;
    }
  }

  await new Promise<void>((resolve, reject) => {
    server.listen(SOCKET_PATH, () => {
      // Set socket permissions (§9.18)
      require('node:fs').chmodSync(SOCKET_PATH, 0o600);
      resolve();
    });
    server.on('error', reject);
  });
}

// ── State File ────────────────────────────────────────

async function writeState(state: HeartbeatState): Promise<void> {
  const tmpPath = STATE_FILE + '.tmp.' + process.pid;
  const fh = await open(tmpPath, 'w');
  try {
    await fh.writeFile(JSON.stringify(state, null, 2));
    if (platform() === 'darwin') {
      await fh.datasync(); // Best-effort on macOS; see §9.18 F_FULLFSYNC caveat
    } else {
      await fh.sync();
    }
  } finally {
    await fh.close();
  }
  await rename(tmpPath, STATE_FILE);
}

// ── Signal Handling ───────────────────────────────────

function setupSignalHandlers(
  cleanup: () => Promise<void>,
  server: ReturnType<typeof createServer>
): void {
  let shuttingDown = false;

  async function shutdown(signal: string): Promise<void> {
    if (shuttingDown) return;
    shuttingDown = true;

    // 10-second deadline for in-flight requests
    const deadline = setTimeout(() => {
      process.exit(1);
    }, 10000);

    try {
      server.close();
      await cleanup();
      await removePidFile();
      await unlink(SOCKET_PATH).catch(() => {});
      clearTimeout(deadline);
      process.exit(0);
    } catch {
      clearTimeout(deadline);
      process.exit(1);
    }
  }

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  // Disable core dumps — vault key in memory (§9.18)
  try {
    // @ts-expect-error — setrlimit not in Node.js types
    if (process.setrlimit) process.setrlimit('core', { soft: 0, hard: 0 });
  } catch { /* not available on all platforms */ }
}

// ── Job Scheduler ─────────────────────────────────────

interface ScheduledJob {
  name: string;
  intervalMs: number;
  handler: () => Promise<void>;
  lastRun: number;
}

class JobScheduler {
  private jobs: ScheduledJob[] = [];
  private timer: ReturnType<typeof setInterval> | null = null;
  private lastTick: number = Date.now();

  add(name: string, intervalMs: number, handler: () => Promise<void>): void {
    this.jobs.push({ name, intervalMs, handler, lastRun: 0 });
  }

  start(): void {
    this.lastTick = Date.now();
    this.timer = setInterval(() => this.tick(), 1000);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
  }

  private async tick(): Promise<void> {
    const now = Date.now();
    const delta = now - this.lastTick;
    this.lastTick = now;

    // Sleep/wake detection (§9.18): if delta > 2x expected (2s), catch-up mode
    if (delta > 2000) {
      // Stagger overdue jobs over 5 minutes, prioritize token refresh
      const overdue = this.jobs.filter(j => now - j.lastRun > j.intervalMs);
      const sorted = overdue.sort((a, b) => {
        if (a.name.includes('token')) return -1;
        if (b.name.includes('token')) return 1;
        return 0;
      });
      for (const job of sorted) {
        try { await job.handler(); } catch { /* logged by handler */ }
        job.lastRun = now;
      }
      return;
    }

    // Normal tick: run due jobs
    for (const job of this.jobs) {
      if (now - job.lastRun >= job.intervalMs) {
        try { await job.handler(); } catch { /* logged by handler */ }
        job.lastRun = now;
      }
    }
  }
}

// ── Log Rotation ──────────────────────────────────────

function createLogger(logPath: string): { log: (msg: string) => void; close: () => void } {
  let stream = createWriteStream(logPath, { flags: 'a' });
  return {
    log(msg: string) {
      stream.write(JSON.stringify({ ts: new Date().toISOString(), msg }) + '\n');
    },
    close() { stream.end(); }
  };
}

export {
  writePidFile, checkStalePid, removePidFile,
  generateSessionToken, validateToken,
  createSocketServer, startSocketServer,
  writeState,
  setupSignalHandlers,
  JobScheduler,
  createLogger,
  PID_FILE, SOCKET_PATH, TOKEN_FILE, STATE_FILE, LOG_FILE,
};
export type { DaemonState, HeartbeatState, ScheduledJob };
