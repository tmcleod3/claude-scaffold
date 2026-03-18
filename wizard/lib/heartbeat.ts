/**
 * Heartbeat Daemon — The single-writer for all financial state (ADR-1).
 *
 * This module implements the heartbeat daemon: a background Node.js process
 * that owns all financial state mutations. The CLI and Danger Room are clients
 * that communicate via the Unix domain socket API.
 *
 * PRD Reference: §9.7, §9.18, §9.19.2, §9.20.4, §9.20.11
 */

import { join } from 'node:path';
import { homedir } from 'node:os';
import { existsSync } from 'node:fs';
import { readFile, appendFile, mkdir } from 'node:fs/promises';

import {
  writePidFile, checkStalePid, removePidFile,
  generateSessionToken, validateToken,
  createSocketServer, startSocketServer,
  writeState, setupSignalHandlers,
  JobScheduler, createLogger,
  STATE_FILE, SOCKET_PATH,
} from '../../docs/patterns/daemon-process.js';

import type { HeartbeatState, DaemonState } from '../../docs/patterns/daemon-process.js';

import { financialVaultGet, financialVaultLock } from './financial-vault.js';
import { totpVerify, totpSessionValid, totpSessionInvalidate } from './totp.js';
import { classifyTier, isAutonomouslyAllowed, DEFAULT_TIERS } from './safety-tiers.js';
import type { Cents } from './safety-tiers.js';

import {
  needsRefresh, handleRefreshFailure, getTokenHealth,
  tokenVaultKey, deserializeTokens,
  shouldRotateSessionToken, rotateSessionToken, validateSessionToken,
} from '../../docs/patterns/oauth-token-lifecycle.js';

import type { SessionTokenState } from '../../docs/patterns/oauth-token-lifecycle.js';

import { appendToLog, atomicWrite, SPEND_LOG, REVENUE_LOG, TREASURY_DIR } from '../../docs/patterns/financial-transaction.js';

const PENDING_OPS = join(TREASURY_DIR, 'pending-ops.jsonl');
const VOIDFORGE_DIR = join(homedir(), '.voidforge');

// ── Daemon State ──────────────────────────────────────

let daemonState: DaemonState = 'starting';
let vaultKey: string | null = null; // Vault password held in memory
let sessionTokenState: SessionTokenState | null = null;
let eventId = 0;
const logger = createLogger(join(VOIDFORGE_DIR, 'heartbeat.log'));

// Platform state tracking
const platformFailures: Record<string, number> = {};
const platformHealth: Record<string, { status: string; expiresAt: string }> = {};

// ── Socket API Request Handler (§9.20.11) ─────────────

async function handleRequest(
  method: string,
  path: string,
  body: unknown,
  auth: { hasToken: boolean; hasVault: boolean; hasTotp: boolean }
): Promise<{ status: number; body: unknown }> {

  // All requests require session token
  if (!auth.hasToken) {
    return { status: 401, body: { ok: false, error: 'Session token required' } };
  }

  // ── Read operations ──────────────────
  if (method === 'GET') {
    if (path === '/status') {
      return { status: 200, body: { ok: true, data: buildStateSnapshot() } };
    }
    if (path === '/campaigns') {
      return { status: 200, body: { ok: true, data: await readCampaigns() } };
    }
    if (path === '/treasury') {
      return { status: 200, body: { ok: true, data: await readTreasurySummary() } };
    }
    return { status: 404, body: { ok: false, error: 'Unknown endpoint' } };
  }

  // ── Write operations ─────────────────
  if (method === 'POST') {
    // Freeze — low friction, session token only (§9.18)
    if (path === '/freeze') {
      return await handleFreeze();
    }

    // Unfreeze — requires vault + TOTP (§9.18)
    if (path === '/unfreeze') {
      if (!auth.hasVault || !auth.hasTotp) {
        return { status: 403, body: { ok: false, error: 'Unfreeze requires vault password + TOTP' } };
      }
      return await handleUnfreeze();
    }

    // Vault unlock — re-enter vault password after timeout
    if (path === '/unlock') {
      return await handleUnlock(body as { password?: string });
    }

    // Campaign pause — session token only (protective action)
    if (path.match(/^\/campaigns\/[^/]+\/pause$/)) {
      const id = path.split('/')[2];
      return await handleCampaignPause(id);
    }

    // Campaign creative update — session token only for non-URL changes (§9.20.11)
    if (path.match(/^\/campaigns\/[^/]+\/creative$/)) {
      const id = path.split('/')[2];
      return { status: 501, body: { ok: false, error: `Creative updates require ad platform adapters (v11.2). Campaign: ${id}` } };
    }

    // Campaign resume — requires vault password
    if (path.match(/^\/campaigns\/[^/]+\/resume$/)) {
      if (!auth.hasVault) {
        return { status: 403, body: { ok: false, error: 'Resume requires vault password' } };
      }
      const id = path.split('/')[2];
      return await handleCampaignResume(id);
    }

    // Campaign launch — requires vault password
    if (path === '/campaigns/launch') {
      if (!auth.hasVault) {
        return { status: 403, body: { ok: false, error: 'Campaign launch requires vault password' } };
      }
      return await handleCampaignLaunch(body);
    }

    // Budget modification — requires vault password
    if (path === '/budget') {
      if (!auth.hasVault) {
        return { status: 403, body: { ok: false, error: 'Budget changes require vault password' } };
      }
      return await handleBudgetChange(body);
    }

    // Manual reconciliation
    if (path === '/reconcile') {
      return await handleReconcile();
    }

    return { status: 404, body: { ok: false, error: 'Unknown endpoint' } };
  }

  return { status: 405, body: { ok: false, error: 'Method not allowed' } };
}

// ── Command Handlers ──────────────────────────────────

async function handleFreeze(): Promise<{ status: number; body: unknown }> {
  logger.log('FREEZE command received');
  daemonState = 'degraded'; // Will be 'frozen' after platforms are paused
  eventId++;
  // In full implementation: iterate all platforms, pause campaigns
  // For now: update state
  await writeCurrentState();
  return { status: 200, body: { ok: true, message: 'Freeze initiated' } };
}

async function handleUnfreeze(): Promise<{ status: number; body: unknown }> {
  logger.log('UNFREEZE command received');
  daemonState = 'healthy';
  eventId++;
  await writeCurrentState();
  return { status: 200, body: { ok: true, message: 'Spending resumed' } };
}

async function handleUnlock(body: { password?: string }): Promise<{ status: number; body: unknown }> {
  if (!body.password) {
    return { status: 400, body: { ok: false, error: 'Password required' } };
  }
  vaultKey = body.password;
  if (daemonState === 'degraded') daemonState = 'healthy';
  logger.log('Vault unlocked');
  eventId++;
  await writeCurrentState();
  return { status: 200, body: { ok: true, message: 'Vault session renewed' } };
}

async function handleCampaignPause(id: string): Promise<{ status: number; body: unknown }> {
  logger.log(`Campaign ${id} pause requested`);
  // In full implementation: call platform adapter pauseCampaign()
  eventId++;
  return { status: 200, body: { ok: true, message: `Campaign ${id} paused` } };
}

async function handleCampaignResume(id: string): Promise<{ status: number; body: unknown }> {
  logger.log(`Campaign ${id} resume requested`);
  eventId++;
  return { status: 200, body: { ok: true, message: `Campaign ${id} resumed` } };
}

async function handleCampaignLaunch(body: unknown): Promise<{ status: number; body: unknown }> {
  logger.log('Campaign launch requested');
  eventId++;
  return { status: 200, body: { ok: true, message: 'Campaign launch processing' } };
}

async function handleBudgetChange(body: unknown): Promise<{ status: number; body: unknown }> {
  logger.log('Budget change requested');
  eventId++;
  return { status: 200, body: { ok: true, message: 'Budget updated' } };
}

async function handleReconcile(): Promise<{ status: number; body: unknown }> {
  logger.log('Manual reconciliation requested');
  eventId++;
  return { status: 200, body: { ok: true, message: 'Reconciliation started' } };
}

// ── State Management ──────────────────────────────────

function buildStateSnapshot(): HeartbeatState {
  return {
    pid: process.pid,
    state: daemonState,
    startedAt: new Date().toISOString(),
    lastHeartbeat: new Date().toISOString(),
    lastEventId: eventId,
    cultivationState: daemonState === 'starting' ? 'inactive' : 'active',
    activePlatforms: Object.keys(platformHealth),
    activeCampaigns: 0, // Populated from campaign files
    todaySpend: 0 as Cents,
    dailyBudget: 0 as Cents,
    alerts: [],
    tokenHealth: platformHealth,
  };
}

async function writeCurrentState(): Promise<void> {
  await writeState(buildStateSnapshot());
}

async function readCampaigns(): Promise<unknown[]> {
  // Read from ~/.voidforge/treasury/campaigns/
  return [];
}

async function readTreasurySummary(): Promise<unknown> {
  return { revenue: 0, spend: 0, net: 0, roas: 0, budgetRemaining: 0 };
}

// ── Scheduled Jobs ────────────────────────────────────

function registerJobs(scheduler: JobScheduler): void {
  // Health ping — every 60 seconds
  scheduler.add('health-ping', 60_000, async () => {
    await writeCurrentState();
  });

  // Token refresh — every 5 minutes (checks per-platform TTL internally)
  scheduler.add('token-refresh', 300_000, async () => {
    if (!vaultKey) {
      logger.log('Token refresh skipped — vault key expired');
      return;
    }
    // Check each platform's token health
    for (const platform of Object.keys(platformHealth)) {
      try {
        const tokenData = await financialVaultGet(vaultKey, tokenVaultKey(platform as never));
        if (!tokenData) continue;
        const tokens = deserializeTokens(tokenData);
        if (needsRefresh(tokens)) {
          logger.log(`Refreshing token for ${platform}`);
          // In full implementation: call adapter.refreshToken()
          platformFailures[platform] = 0;
        }
      } catch (err) {
        platformFailures[platform] = (platformFailures[platform] || 0) + 1;
        const action = handleRefreshFailure(platform as never, String(err), platformFailures[platform]);
        if (action.action === 'pause_and_alert' || action.action === 'reauth') {
          platformHealth[platform] = { status: 'requires_reauth', expiresAt: '' };
          logger.log(`Platform ${platform} requires re-authentication`);
        }
      }
    }
  });

  // Spend check — hourly
  scheduler.add('spend-check', 3_600_000, async () => {
    logger.log('Hourly spend check');
    // In full implementation: query each platform for current spend
  });

  // Campaign status — every 15 minutes
  scheduler.add('campaign-status', 900_000, async () => {
    logger.log('Campaign status check');
  });

  // Reconciliation — runs at midnight UTC and 06:00 UTC
  scheduler.add('reconciliation', 3_600_000, async () => {
    const hour = new Date().getUTCHours();
    if (hour === 0 || hour === 6) {
      logger.log(`Reconciliation (${hour === 0 ? 'preliminary' : 'authoritative'})`);
    }
  });

  // A/B test evaluation — daily (§9.19.4 Tier 1)
  scheduler.add('ab-test-eval', 86_400_000, async () => {
    logger.log('A/B test evaluation');
  });

  // Campaign kill check — daily (§9.20.5)
  scheduler.add('kill-check', 86_400_000, async () => {
    logger.log('Campaign kill check');
  });

  // Budget rebalancing — weekly (§9.19.4 Tier 1)
  scheduler.add('budget-rebalance', 604_800_000, async () => {
    logger.log('Weekly budget rebalancing');
  });

  // Growth report — weekly
  scheduler.add('growth-report', 604_800_000, async () => {
    logger.log('Weekly growth report generation');
  });
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

async function writePendingOp(op: PendingOp): Promise<void> {
  await mkdir(TREASURY_DIR, { recursive: true });
  await appendFile(PENDING_OPS, JSON.stringify(op) + '\n', 'utf-8');
}

async function reconcilePendingOps(): Promise<void> {
  if (!existsSync(PENDING_OPS)) return;
  const content = await readFile(PENDING_OPS, 'utf-8');
  const lines = content.trim().split('\n').filter(Boolean);

  for (const line of lines) {
    try {
      const op: PendingOp = JSON.parse(line);
      if (op.status !== 'pending') continue;

      const age = Date.now() - new Date(op.createdAt).getTime();
      if (age > 24 * 60 * 60 * 1000) {
        // >24h old: mark stale, pause if campaign was being created
        logger.log(`Stale pending op: ${op.intentId} (${op.operation})`);
        // In full implementation: query platform, if found active → pause and alert
      } else if (age > 5 * 60 * 1000) {
        // >5 min: check with platform using idempotency key
        logger.log(`Reconciling pending op: ${op.intentId}`);
      }
    } catch { /* malformed line */ }
  }
}

// ── Main Entry Point ──────────────────────────────────

export async function startHeartbeat(vaultPassword: string): Promise<void> {
  logger.log('Heartbeat daemon starting');

  // Step 1-2: Check for existing daemon
  const anotherRunning = await checkStalePid();
  if (anotherRunning) {
    throw new Error('Another heartbeat daemon is already running');
  }

  // Step 3: Check for dirty shutdown
  if (existsSync(STATE_FILE)) {
    try {
      const state = JSON.parse(await readFile(STATE_FILE, 'utf-8'));
      if (state.state !== 'stopped' && state.state !== 'shutting_down') {
        daemonState = 'recovering';
        logger.log('Dirty shutdown detected — entering recovery');
      }
    } catch { /* corrupted state file */ }
  }

  // Step 4: Vault password
  vaultKey = vaultPassword;

  // Step 5: Reconcile pending ops (ADR-3)
  await reconcilePendingOps();

  // Step 6: Generate session token
  const token = await generateSessionToken();
  sessionTokenState = {
    current: token,
    rotatedAt: Date.now(),
  };

  // Step 7: Write PID file
  await writePidFile();

  // Step 8: Create and start socket server
  const server = createSocketServer(token, handleRequest);
  await startSocketServer(server);

  // Step 9: Set up signal handlers
  setupSignalHandlers(async () => {
    logger.log('Shutting down gracefully');
    daemonState = 'shutting_down';
    await writeCurrentState();
    financialVaultLock();
    totpSessionInvalidate();
    logger.close();
  }, server);

  // Step 10: Start job scheduler
  const scheduler = new JobScheduler();
  registerJobs(scheduler);
  scheduler.start();

  // Transition to healthy
  daemonState = daemonState === 'recovering' ? 'degraded' : 'healthy';
  await writeCurrentState();

  logger.log(`Heartbeat daemon running (PID ${process.pid}, state: ${daemonState})`);
}

export { daemonState, vaultKey };
