/**
 * Heartbeat Lifecycle — daemon startup/shutdown orchestration.
 *
 * Extracted from heartbeat.ts to isolate the daemon lifecycle logic:
 * PID file management, vault password acquisition, signal handlers,
 * state recovery, socket server creation, and WAL reconciliation.
 *
 * The startDaemon() function is the main lifecycle entry point, called
 * by startHeartbeat() in heartbeat.ts with all required callbacks.
 */

import { existsSync } from 'node:fs';
import { readFile, appendFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import type { Server } from 'node:net';

import {
  writePidFile, checkStalePid,
  generateSessionToken,
  createSocketServer, startSocketServer,
  setupSignalHandlers,
  checkGlobalDaemon,
  STATE_FILE,
} from './daemon-core.js';

import type { DaemonState } from './daemon-core.js';
import type { SessionTokenState } from './oauth-core.js';

// ── Types ─────────────────────────────────────────────

export interface LifecycleCallbacks {
  logger: { log: (msg: string) => void; close: () => void };
  getDaemonState: () => DaemonState;
  setDaemonState: (state: DaemonState) => void;
  setVaultKey: (key: string) => void;
  setSessionTokenState: (state: SessionTokenState) => void;
  getDaemonProjectDir: () => string | undefined;
  writeCurrentState: () => Promise<void>;
  onShutdown: () => Promise<void>;
  handleRequest: (
    method: string, path: string, body: unknown,
    auth: { hasToken: boolean; vaultPassword: string; totpCode: string },
  ) => Promise<{ status: number; body: unknown }>;
  activeTreasuryDir: () => string;
}

// ── WAL (Write-Ahead Log) per ADR-3 ──────────────────

interface PendingOp {
  intentId: string;
  operation: string;
  platform: string;
  params: unknown;
  status: 'pending' | 'completed' | 'failed' | 'stale' | 'abandoned';
  createdAt: string;
  completedAt?: string;
  error?: string;
}

function pendingOpsPath(activeTreasuryDir: string): string {
  return join(activeTreasuryDir, 'pending-ops.jsonl');
}

export async function writePendingOp(op: PendingOp, activeTreasuryDir: string): Promise<void> {
  await mkdir(activeTreasuryDir, { recursive: true, mode: 0o700 });
  await appendFile(pendingOpsPath(activeTreasuryDir), JSON.stringify(op) + '\n', 'utf-8');
}

export async function reconcilePendingOps(
  activeTreasuryDir: string,
  logger: { log: (msg: string) => void },
): Promise<void> {
  const opsPath = pendingOpsPath(activeTreasuryDir);
  if (!existsSync(opsPath)) return;
  const content = await readFile(opsPath, 'utf-8');
  const lines = content.trim().split('\n').filter(Boolean);

  for (const line of lines) {
    try {
      const op: PendingOp = JSON.parse(line);
      if (op.status !== 'pending') continue;

      const age = Date.now() - new Date(op.createdAt).getTime();
      if (age > 24 * 60 * 60 * 1000) {
        logger.log(`Stale pending op: ${op.intentId} (${op.operation})`);
      } else if (age > 5 * 60 * 1000) {
        logger.log(`Reconciling pending op: ${op.intentId}`);
      }
    } catch { /* malformed line */ }
  }
}

// ── Hash Chain Helper ────────────────────────────────

export async function getLastLogHash(logPath: string): Promise<string> {
  try {
    const content = await readFile(logPath, 'utf-8');
    const lines = content.trim().split('\n').filter(Boolean);
    if (lines.length === 0) return '0';
    const lastEntry = JSON.parse(lines[lines.length - 1]) as { hash?: string };
    return lastEntry.hash ?? '0';
  } catch {
    return '0';
  }
}

// ── Campaign Persistence ─────────────────────────────

export interface CampaignRecord {
  campaignId: string;
  externalId: string;
  platform: import('./financial/campaign/base.js').AdPlatform;
  status: import('./campaign-state-machine.js').CampaignStatus;
  name: string;
  dailyBudgetCents: number;
  createdAt: string;
  updatedAt: string;
}

/** Validate campaign ID — must be UUID-like (alphanumeric + hyphens). Prevents path traversal. */
export function validateCampaignId(id: string): boolean {
  return /^[a-zA-Z0-9_-]{1,128}$/.test(id);
}

// ── Daemon Lifecycle ─────────────────────────────────

/**
 * Start the daemon: PID check, state recovery, vault init, socket server, signal handlers.
 * Returns the socket server and session token for the caller to wire into the scheduler.
 */
export async function startDaemon(
  vaultPassword: string,
  cb: LifecycleCallbacks,
): Promise<{ server: Server; token: string }> {
  cb.logger.log('Heartbeat daemon starting');

  // Step 1-2: Check for existing daemon
  const anotherRunning = await checkStalePid();
  if (anotherRunning) {
    throw new Error('Another heartbeat daemon is already running');
  }

  // Step 1b: Dual-daemon guard (ADR-041 La Forge CRITICAL — prevent split-brain)
  if (cb.getDaemonProjectDir()) {
    const globalRunning = await checkGlobalDaemon();
    if (globalRunning) {
      throw new Error('A global heartbeat daemon is running at ~/.voidforge/run/. Stop it before starting a per-project daemon.');
    }
  }

  // Step 3: Check for dirty shutdown
  if (existsSync(STATE_FILE)) {
    try {
      const state = JSON.parse(await readFile(STATE_FILE, 'utf-8'));
      if (state.state !== 'stopped' && state.state !== 'shutting_down') {
        cb.setDaemonState('recovering');
        cb.logger.log('Dirty shutdown detected — entering recovery');
      }
    } catch { /* corrupted state file */ }
  }

  // Step 4: Vault password
  cb.setVaultKey(vaultPassword);

  // Step 5: Reconcile pending ops (ADR-3)
  await reconcilePendingOps(cb.activeTreasuryDir(), cb.logger);

  // Step 6: Generate session token
  const token = await generateSessionToken();
  cb.setSessionTokenState({ current: token, rotatedAt: Date.now() });

  // Step 7: Write PID file
  await writePidFile();

  // Step 8: Create and start socket server
  const server = createSocketServer(token, cb.handleRequest);
  await startSocketServer(server);

  // Step 9: Set up signal handlers
  setupSignalHandlers(cb.onShutdown, server);

  return { server, token };
}
