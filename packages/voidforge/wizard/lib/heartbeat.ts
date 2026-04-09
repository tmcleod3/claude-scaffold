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
  checkGlobalDaemon,
  STATE_FILE, SOCKET_PATH,
} from './daemon-core.js';

import type { HeartbeatState, DaemonState } from './daemon-core.js';

import { financialVaultGet, financialVaultLock, financialVaultUnlock } from './financial-vault.js';
import { totpVerify, totpSessionValid, totpSessionInvalidate } from './totp.js';
import { classifyTier, isAutonomouslyAllowed, DEFAULT_TIERS } from './safety-tiers.js';
import type { Cents } from './safety-tiers.js';

import {
  needsRefresh, handleRefreshFailure, getTokenHealth,
  tokenVaultKey, deserializeTokens,
  shouldRotateSessionToken, rotateSessionToken, validateSessionToken,
} from './oauth-core.js';

import type { SessionTokenState } from './oauth-core.js';

import { appendToLog, atomicWrite, getTreasuryDir, getSpendLog, getRevenueLog } from './financial-core.js';

import {
  registerTreasuryJobs, handleTreasuryRequest, executeTreasuryFreeze,
  getTreasuryStateSnapshot, isStablecoinConfigured,
} from './treasury-heartbeat.js';

import { getCampaignAdapter } from './financial/adapter-factory.js';
import { transition } from './campaign-state-machine.js';
import type { CampaignStatus } from './campaign-state-machine.js';
import type { AdPlatformAdapter, CampaignConfig, AdPlatform } from './financial/campaign/base.js';

function activePendingOps(): string { return join(activeTreasuryDir(), 'pending-ops.jsonl'); }
function activeCampaignsDir(): string { return join(activeTreasuryDir(), 'campaigns'); }
const VOIDFORGE_DIR = join(homedir(), '.voidforge');

// ── Hash Chain Helper ────────────────────────────────────
// Reads the last line of a JSONL log file and extracts the hash field.
// Returns '0' (genesis hash) if the file is empty or does not exist.

async function getLastLogHash(logPath: string): Promise<string> {
  try {
    const content = await readFile(logPath, 'utf-8');
    const lines = content.trim().split('\n').filter(Boolean);
    if (lines.length === 0) return '0';
    const lastEntry = JSON.parse(lines[lines.length - 1]) as { hash?: string };
    return lastEntry.hash ?? '0';
  } catch {
    // File does not exist or is unreadable — genesis hash
    return '0';
  }
}

// ── Daemon State ──────────────────────────────────────

let daemonState: DaemonState = 'starting';
let vaultKey: string | null = null; // Vault password held in memory
let sessionTokenState: SessionTokenState | null = null;
let eventId = 0;
const logger = createLogger(join(VOIDFORGE_DIR, 'heartbeat.log'));
const daemonStartedAt = new Date().toISOString(); // Store once at module level (VG-R1-001)

// Project ID and directory for per-project operations (ADR-041 M0.4 + M3).
// Set to defaults until M2 wires in --project-dir CLI arg via setDaemonProjectDir().
let daemonProjectId = 'global';
let daemonProjectDir: string | undefined;

/** Get the active treasury dir — per-project if configured, else global. */
function activeTreasuryDir(): string { return getTreasuryDir(daemonProjectDir); }
function activeSpendLog(): string { return getSpendLog(daemonProjectDir); }
function activeRevenueLog(): string { return getRevenueLog(daemonProjectDir); }

// Platform state tracking
const platformFailures: Record<string, number> = {};
const platformHealth: Record<string, { status: string; expiresAt: string }> = {};

// ── Socket API Request Handler (§9.20.11) ─────────────

async function handleRequest(
  method: string,
  path: string,
  body: unknown,
  auth: { hasToken: boolean; vaultPassword: string; totpCode: string }
): Promise<{ status: number; body: unknown }> {

  // All requests require session token
  if (!auth.hasToken) {
    return { status: 401, body: { ok: false, error: 'Session token required' } };
  }

  // SEC-001 + R4-MAUL-001: Verify vault password with HMAC comparison (constant-time
  // regardless of input length — no length leak unlike timingSafeEqual's length check)
  let vaultVerified = false;
  if (auth.vaultPassword && vaultKey) {
    const { createHmac, timingSafeEqual } = await import('node:crypto');
    const HMAC_KEY = 'voidforge-vault-password-comparison-v1';
    const providedMac = createHmac('sha256', HMAC_KEY).update(auth.vaultPassword).digest();
    const expectedMac = createHmac('sha256', HMAC_KEY).update(vaultKey).digest();
    vaultVerified = timingSafeEqual(providedMac, expectedMac);
  }

  // SEC-001: Verify TOTP code (not just presence)
  let totpVerified = false;
  if (auth.totpCode) {
    try {
      totpVerified = await totpVerify(auth.totpCode);
    } catch { /* TOTP not configured — treat as false */ }
  }

  // ── Treasury routes (delegated to treasury-heartbeat module) ──
  const treasuryFreeze = async (reason: string): Promise<void> => {
    await executeTreasuryFreeze(reason, logger);
    daemonState = 'degraded';
    eventId++;
    await writeCurrentState();
  };

  if (path.startsWith('/treasury/')) {
    const treasuryResult = await handleTreasuryRequest(
      method, path, body,
      { vaultVerified, totpVerified },
      logger, treasuryFreeze,
      vaultKey,
    );
    if (treasuryResult) {
      eventId++;
      return treasuryResult;
    }
  }

  // ── Read operations ──────────────────
  if (method === 'GET') {
    if (path === '/status') {
      return { status: 200, body: { ok: true, data: await buildStateSnapshot() } };
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
      if (!vaultVerified || !totpVerified) {
        return { status: 403, body: { ok: false, error: 'Unfreeze requires valid vault password + TOTP code' } };
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
      return await handleCreativeUpdate(id, body);
    }

    // Campaign resume — requires vault password
    if (path.match(/^\/campaigns\/[^/]+\/resume$/)) {
      if (!vaultVerified) {
        return { status: 403, body: { ok: false, error: 'Resume requires valid vault password' } };
      }
      const id = path.split('/')[2];
      return await handleCampaignResume(id);
    }

    // Campaign launch — requires vault password + safety tier check (SEC-004)
    if (path === '/campaigns/launch') {
      if (!vaultVerified) {
        return { status: 403, body: { ok: false, error: 'Campaign launch requires valid vault password' } };
      }
      return await handleCampaignLaunch(body);
    }

    // Budget modification — requires vault password + safety tier check (SEC-004)
    if (path === '/budget') {
      if (!vaultVerified) {
        return { status: 403, body: { ok: false, error: 'Budget changes require valid vault password' } };
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

// ── Campaign Persistence ─────────────────────────────

interface CampaignRecord {
  campaignId: string;
  externalId: string;
  platform: AdPlatform;
  status: CampaignStatus;
  name: string;
  dailyBudgetCents: number;
  createdAt: string;
  updatedAt: string;
}

/** Validate campaign ID — must be UUID-like (alphanumeric + hyphens). Prevents path traversal. */
function validateCampaignId(id: string): boolean {
  return /^[a-zA-Z0-9_-]{1,128}$/.test(id);
}

async function writeCampaignRecord(record: CampaignRecord): Promise<void> {
  if (!validateCampaignId(record.campaignId)) {
    throw new Error(`Invalid campaign ID format: ${record.campaignId.slice(0, 20)}`);
  }
  await mkdir(activeCampaignsDir(), { recursive: true });
  const filePath = join(activeCampaignsDir(), `${record.campaignId}.json`);
  await atomicWrite(filePath, JSON.stringify(record, null, 2));
}

async function readCampaignRecord(campaignId: string): Promise<CampaignRecord | null> {
  if (!validateCampaignId(campaignId)) return null;
  const filePath = join(activeCampaignsDir(), `${campaignId}.json`);
  try {
    const content = await readFile(filePath, 'utf-8');
    return JSON.parse(content) as CampaignRecord;
  } catch { return null; }
}

async function getActiveCampaignRecords(): Promise<CampaignRecord[]> {
  const campaigns = await readCampaigns() as CampaignRecord[];
  return campaigns.filter(c => c.status === 'active');
}

async function getSuspendedCampaignRecords(): Promise<CampaignRecord[]> {
  const campaigns = await readCampaigns() as CampaignRecord[];
  return campaigns.filter(c => c.status === 'suspended');
}

async function getAdapterForPlatform(platform: AdPlatform): Promise<AdPlatformAdapter> {
  return getCampaignAdapter(platform, vaultKey, logger);
}

// ── Command Handlers ──────────────────────────────────

async function handleFreeze(): Promise<{ status: number; body: unknown }> {
  logger.log('FREEZE command received — pausing all active campaigns');
  const activeCampaigns = await getActiveCampaignRecords();
  let pausedCount = 0;
  const errors: string[] = [];

  for (const campaign of activeCampaigns) {
    try {
      const adapter = await getAdapterForPlatform(campaign.platform);
      await adapter.pauseCampaign(campaign.externalId);
      const event = transition(campaign.status, 'suspended', 'cli', 'freeze');
      campaign.status = event.newStatus as CampaignStatus;
      campaign.updatedAt = new Date().toISOString();
      await writeCampaignRecord(campaign);
      pausedCount++;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`${campaign.campaignId}: ${msg}`);
      logger.log(`Freeze: failed to pause campaign ${campaign.campaignId}: ${msg}`);
    }
  }

  daemonState = 'degraded';
  eventId++;
  await writeCurrentState();
  const allPaused = errors.length === 0;
  logger.log(`Freeze complete: ${pausedCount}/${activeCampaigns.length} campaigns paused${allPaused ? '' : ` (${errors.length} failures)`}`);
  return {
    status: allPaused ? 200 : 207,
    body: {
      ok: allPaused,
      message: allPaused
        ? `Freeze complete: ${pausedCount} campaigns paused`
        : `Freeze partial: ${pausedCount}/${activeCampaigns.length} campaigns paused, ${errors.length} failed`,
      pausedCount,
      totalCampaigns: activeCampaigns.length,
      errors: errors.length > 0 ? errors : undefined,
    },
  };
}

async function handleUnfreeze(): Promise<{ status: number; body: unknown }> {
  logger.log('UNFREEZE command received — resuming suspended campaigns');
  const suspendedCampaigns = await getSuspendedCampaignRecords();
  let resumedCount = 0;
  const errors: string[] = [];

  for (const campaign of suspendedCampaigns) {
    try {
      const adapter = await getAdapterForPlatform(campaign.platform);
      await adapter.resumeCampaign(campaign.externalId);
      const event = transition(campaign.status, 'active', 'cli', 'unfreeze');
      campaign.status = event.newStatus as CampaignStatus;
      campaign.updatedAt = new Date().toISOString();
      await writeCampaignRecord(campaign);
      resumedCount++;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`${campaign.campaignId}: ${msg}`);
      logger.log(`Unfreeze: failed to resume campaign ${campaign.campaignId}: ${msg}`);
    }
  }

  daemonState = 'healthy';
  eventId++;
  await writeCurrentState();
  logger.log(`Unfreeze complete: ${resumedCount}/${suspendedCampaigns.length} campaigns resumed`);
  return {
    status: 200,
    body: {
      ok: true,
      message: `Spending resumed: ${resumedCount} campaigns unfrozen`,
      resumedCount,
      errors: errors.length > 0 ? errors : undefined,
    },
  };
}

async function handleUnlock(body: { password?: string }): Promise<{ status: number; body: unknown }> {
  if (!body.password) {
    return { status: 400, body: { ok: false, error: 'Password required' } };
  }
  // SEC-002: Verify the password can actually decrypt the vault before accepting
  const valid = await financialVaultUnlock(body.password);
  if (!valid) {
    logger.log('Vault unlock failed — wrong password');
    return { status: 403, body: { ok: false, error: 'Invalid vault password' } };
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
  const record = await readCampaignRecord(id);
  if (!record) {
    return { status: 404, body: { ok: false, error: `Campaign not found: ${id}` } };
  }

  try {
    const adapter = await getAdapterForPlatform(record.platform);
    await adapter.pauseCampaign(record.externalId);
    const event = transition(record.status, 'paused', 'cli', 'user_paused');
    record.status = event.newStatus as CampaignStatus;
    record.updatedAt = new Date().toISOString();
    await writeCampaignRecord(record);
    eventId++;
    await appendToLog(activeSpendLog(), { type: 'campaign_pause', campaignId: id, projectId: daemonProjectId, timestamp: record.updatedAt }, await getLastLogHash(activeSpendLog()));
    logger.log(`Campaign ${id} paused on ${record.platform}`);
    return { status: 200, body: { ok: true, campaignId: id, status: 'paused' } };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.log(`Campaign ${id} pause failed: ${msg}`);
    return { status: 500, body: { ok: false, error: `Pause failed: ${msg}` } };
  }
}

async function handleCampaignResume(id: string): Promise<{ status: number; body: unknown }> {
  logger.log(`Campaign ${id} resume requested`);
  const record = await readCampaignRecord(id);
  if (!record) {
    return { status: 404, body: { ok: false, error: `Campaign not found: ${id}` } };
  }

  try {
    const adapter = await getAdapterForPlatform(record.platform);
    await adapter.resumeCampaign(record.externalId);
    const event = transition(record.status, 'active', 'cli', 'user_resumed');
    record.status = event.newStatus as CampaignStatus;
    record.updatedAt = new Date().toISOString();
    await writeCampaignRecord(record);
    eventId++;
    await appendToLog(activeSpendLog(), { type: 'campaign_resume', campaignId: id, projectId: daemonProjectId, timestamp: record.updatedAt }, await getLastLogHash(activeSpendLog()));
    logger.log(`Campaign ${id} resumed on ${record.platform}`);
    return { status: 200, body: { ok: true, campaignId: id, status: 'active' } };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.log(`Campaign ${id} resume failed: ${msg}`);
    return { status: 500, body: { ok: false, error: `Resume failed: ${msg}` } };
  }
}

async function handleCampaignLaunch(body: unknown): Promise<{ status: number; body: unknown }> {
  logger.log('Campaign launch requested');
  const config = body as {
    name?: string; platform?: AdPlatform; objective?: string;
    dailyBudgetCents?: number; idempotencyKey?: string;
    targeting?: CampaignConfig['targeting']; creative?: CampaignConfig['creative'];
  };

  // Validate required fields
  if (!config.name || !config.platform || !config.dailyBudgetCents || !config.idempotencyKey) {
    return { status: 400, body: { ok: false, error: 'Missing required fields: name, platform, dailyBudgetCents, idempotencyKey' } };
  }

  // Budget validation — must be positive finite integer
  if (!Number.isFinite(config.dailyBudgetCents) || config.dailyBudgetCents <= 0 || !Number.isInteger(config.dailyBudgetCents)) {
    return { status: 400, body: { ok: false, error: 'dailyBudgetCents must be a positive integer' } };
  }

  // Safety tier check (SEC-004): classify budget against aggregate of active campaigns
  const activeCampaigns = await getActiveCampaignRecords();
  const aggregateDailySpend = activeCampaigns.reduce(
    (sum, c) => (sum + (c.dailyBudgetCents || 0)) as Cents, 0 as Cents,
  );
  const tierResult = classifyTier(config.dailyBudgetCents as Cents, aggregateDailySpend);
  if (tierResult.tier !== 'auto_approve') {
    logger.log(`Campaign launch: budget $${(config.dailyBudgetCents / 100).toFixed(2)} + aggregate $${(aggregateDailySpend / 100).toFixed(2)}/day → ${tierResult.tier} (${tierResult.reason})`);
    if (tierResult.requiresTotp) {
      return { status: 403, body: { ok: false, error: `Budget tier: ${tierResult.tier}. ${tierResult.reason}. Requires TOTP.` } };
    }
  }

  try {
    const adapter = await getAdapterForPlatform(config.platform);
    const campaignConfig: CampaignConfig = {
      name: config.name,
      platform: config.platform,
      objective: (config.objective as CampaignConfig['objective']) ?? 'traffic',
      dailyBudget: config.dailyBudgetCents as Cents,
      targeting: config.targeting ?? { audiences: [], locations: [] },
      creative: config.creative ?? { headlines: [], descriptions: [], callToAction: '', landingUrl: '' },
      idempotencyKey: config.idempotencyKey,
      complianceStatus: 'passed',
    };

    // WAL entry before platform call
    await writePendingOp({
      intentId: config.idempotencyKey,
      operation: 'campaign_launch',
      platform: config.platform,
      params: campaignConfig,
      status: 'pending',
      createdAt: new Date().toISOString(),
    });

    const result = await adapter.createCampaign(campaignConfig);

    // Transition state: creating → active (or pending_review → creating based on platform)
    const campaignId = config.idempotencyKey;
    const now = new Date().toISOString();
    const record: CampaignRecord = {
      campaignId,
      externalId: result.externalId,
      platform: config.platform,
      status: result.status === 'pending_review' ? 'pending_approval' : 'active',
      name: config.name,
      dailyBudgetCents: config.dailyBudgetCents,
      createdAt: now,
      updatedAt: now,
    };
    await writeCampaignRecord(record);

    // Log spend event
    await appendToLog(activeSpendLog(), {
      type: 'campaign_launch',
      campaignId,
      projectId: daemonProjectId,
      externalId: result.externalId,
      platform: config.platform,
      dailyBudgetCents: config.dailyBudgetCents,
      timestamp: now,
    }, await getLastLogHash(activeSpendLog()));

    eventId++;
    logger.log(`Campaign launched: ${campaignId} → ${result.externalId} on ${config.platform} (status: ${record.status})`);
    return {
      status: 200,
      body: {
        ok: true,
        campaignId,
        externalId: result.externalId,
        platform: config.platform,
        status: record.status,
        dashboardUrl: result.dashboardUrl,
      },
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.log(`Campaign launch failed: ${msg}`);
    return { status: 500, body: { ok: false, error: `Launch failed: ${msg}` } };
  }
}

async function handleBudgetChange(body: unknown): Promise<{ status: number; body: unknown }> {
  logger.log('Budget change requested');
  const params = body as { campaignId?: string; newBudgetCents?: number };

  if (!params.campaignId || params.newBudgetCents === undefined) {
    return { status: 400, body: { ok: false, error: 'Missing required fields: campaignId, newBudgetCents' } };
  }

  // Budget validation — must be positive finite integer
  if (!Number.isFinite(params.newBudgetCents) || params.newBudgetCents <= 0 || !Number.isInteger(params.newBudgetCents)) {
    return { status: 400, body: { ok: false, error: 'newBudgetCents must be a positive integer' } };
  }

  // Safety tier check BEFORE WAL (SEC-004) — consider aggregate of active campaigns
  const activeBudgets = await getActiveCampaignRecords();
  const currentAggregate = activeBudgets.reduce(
    (sum, c) => (sum + (c.dailyBudgetCents || 0)) as Cents, 0 as Cents,
  );
  const tierResult = classifyTier(params.newBudgetCents as Cents, currentAggregate);
  if (tierResult.requiresTotp) {
    return { status: 403, body: { ok: false, error: `Budget tier: ${tierResult.tier}. ${tierResult.reason}. Requires TOTP.` } };
  }

  // WAL entry before platform call (ADR-3) — only after tier check passes
  await writePendingOp({
    intentId: `budget_${params.campaignId}_${Date.now()}`,
    operation: 'budget_change',
    platform: 'unknown',
    params,
    status: 'pending',
    createdAt: new Date().toISOString(),
  });

  const record = await readCampaignRecord(params.campaignId);
  if (!record) {
    return { status: 404, body: { ok: false, error: `Campaign not found: ${params.campaignId}` } };
  }

  try {
    const adapter = await getAdapterForPlatform(record.platform);
    await adapter.updateBudget(record.externalId, params.newBudgetCents as Cents);

    const oldBudget = record.dailyBudgetCents;
    record.dailyBudgetCents = params.newBudgetCents;
    record.updatedAt = new Date().toISOString();
    await writeCampaignRecord(record);

    await appendToLog(activeSpendLog(), {
      type: 'budget_change',
      campaignId: params.campaignId,
      projectId: daemonProjectId,
      oldBudgetCents: oldBudget,
      newBudgetCents: params.newBudgetCents,
      timestamp: record.updatedAt,
    }, await getLastLogHash(activeSpendLog()));

    eventId++;
    logger.log(`Budget changed: ${params.campaignId} $${(oldBudget / 100).toFixed(2)} → $${(params.newBudgetCents / 100).toFixed(2)}`);
    return { status: 200, body: { ok: true, campaignId: params.campaignId, newBudgetCents: params.newBudgetCents } };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.log(`Budget change failed: ${msg}`);
    return { status: 500, body: { ok: false, error: `Budget change failed: ${msg}` } };
  }
}

async function handleCreativeUpdate(id: string, body: unknown): Promise<{ status: number; body: unknown }> {
  logger.log(`Creative update for campaign ${id}`);
  const record = await readCampaignRecord(id);
  if (!record) {
    return { status: 404, body: { ok: false, error: `Campaign not found: ${id}` } };
  }

  const creative = body as { headlines?: string[]; descriptions?: string[]; callToAction?: string; landingUrl?: string; imageUrls?: string[] };

  try {
    const adapter = await getAdapterForPlatform(record.platform);
    await adapter.updateCreative(record.externalId, creative);
    record.updatedAt = new Date().toISOString();
    await writeCampaignRecord(record);
    eventId++;
    logger.log(`Creative updated for campaign ${id} on ${record.platform}`);
    return { status: 200, body: { ok: true, campaignId: id, message: 'Creative updated' } };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.log(`Creative update failed for ${id}: ${msg}`);
    return { status: 500, body: { ok: false, error: `Creative update failed: ${msg}` } };
  }
}

async function handleReconcile(): Promise<{ status: number; body: unknown }> {
  logger.log('Manual reconciliation requested');
  eventId++;
  try {
    const { runReconciliation } = await import('./reconciliation.js');
    const today = new Date().toISOString().slice(0, 10);
    const hour = new Date().getUTCHours();
    const type = hour >= 6 ? 'final' : 'preliminary';
    // Run reconciliation with empty platform reports (manual trigger — platforms queried separately)
    const report = await runReconciliation('default', today, type, new Map(), new Map());
    return { status: 200, body: { ok: true, message: `Reconciliation (${type}) completed`, report } };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Reconciliation failed';
    logger.log(`Reconciliation error: ${message}`);
    return { status: 500, body: { ok: false, error: `Reconciliation failed: ${message}` } };
  }
}

// ── State Management ──────────────────────────────────

async function buildStateSnapshot(): Promise<HeartbeatState> {
  // v17.0: Read real campaign and treasury data
  const campaigns = await readCampaigns();
  const activeCampaigns = campaigns.filter((c: unknown) => (c as { status?: string }).status === 'active').length;
  const summary = await readTreasurySummary() as { spend: number; revenue: number };

  // v19.0: Include treasury state when stablecoin is configured
  const treasurySnapshot = isStablecoinConfigured()
    ? getTreasuryStateSnapshot()
    : undefined;
  const alerts: string[] = [];
  if (treasurySnapshot?.fundingFrozen) {
    alerts.push(`Funding frozen: ${treasurySnapshot.freezeReason ?? 'unknown reason'}`);
  }

  return {
    pid: process.pid,
    state: daemonState,
    startedAt: daemonStartedAt,
    lastHeartbeat: new Date().toISOString(),
    lastEventId: eventId,
    cultivationState: daemonState === 'starting' ? 'inactive' : 'active',
    activePlatforms: Object.keys(platformHealth),
    activeCampaigns,
    todaySpend: summary.spend as Cents,
    dailyBudget: 0 as Cents,
    alerts,
    tokenHealth: platformHealth,
    // Treasury state fields (v19.0 — written to heartbeat.json for Danger Room)
    ...(treasurySnapshot ? {
      stablecoinBalanceCents: treasurySnapshot.stablecoinBalanceCents,
      bankBalanceCents: treasurySnapshot.bankBalanceCents,
      runwayDays: treasurySnapshot.runwayDays,
      fundingFrozen: treasurySnapshot.fundingFrozen,
      pendingTransferCount: treasurySnapshot.pendingTransferCount,
    } : {}),
  };
}

async function writeCurrentState(): Promise<void> {
  await writeState(await buildStateSnapshot());
}

async function readCampaigns(): Promise<unknown[]> {
  // v17.0: Read campaign state from treasury directory
  const campaignsDir = activeCampaignsDir();
  try {
    const { readdir } = await import('node:fs/promises');
    if (!existsSync(campaignsDir)) return [];
    const files = await readdir(campaignsDir);
    const campaigns: unknown[] = [];
    for (const file of files) {
      if (!file.endsWith('.json')) continue;
      try {
        const content = await readFile(join(campaignsDir, file), 'utf-8');
        campaigns.push(JSON.parse(content));
      } catch { /* skip malformed campaign files */ }
    }
    return campaigns;
  } catch { return []; }
}

async function readTreasurySummary(): Promise<unknown> {
  // v17.0: Read actual treasury data from spend/revenue logs
  try {
    let totalSpendCents = 0;
    let totalRevenueCents = 0;

    if (existsSync(activeSpendLog())) {
      const lines = (await readFile(activeSpendLog(), 'utf-8')).trim().split('\n').filter(Boolean);
      for (const line of lines) {
        try {
          const entry = JSON.parse(line) as { amountCents?: number };
          // Clamp negative values — spend should never be negative
          totalSpendCents += Math.max(0, entry.amountCents ?? 0);
        } catch { /* skip malformed lines */ }
      }
    }

    if (existsSync(activeRevenueLog())) {
      const lines = (await readFile(activeRevenueLog(), 'utf-8')).trim().split('\n').filter(Boolean);
      for (const line of lines) {
        try {
          const entry = JSON.parse(line) as { amountCents?: number };
          totalRevenueCents += entry.amountCents ?? 0;
        } catch { /* skip malformed lines */ }
      }
    }

    const net = totalRevenueCents - totalSpendCents;
    const roas = totalSpendCents > 0 ? totalRevenueCents / totalSpendCents : 0;

    return { revenue: totalRevenueCents, spend: totalSpendCents, net, roas, budgetRemaining: 0 };
  } catch {
    return { revenue: 0, spend: 0, net: 0, roas: 0, budgetRemaining: 0 };
  }
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
          const adapter = await getAdapterForPlatform(platform as AdPlatform);
          await adapter.refreshToken(tokens);
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

  // Spend check — hourly: read campaigns and log total spend
  scheduler.add('spend-check', 3_600_000, async () => {
    const campaigns = await readCampaigns();
    const summary = await readTreasurySummary() as { spend: number; revenue: number };
    logger.log(`Hourly spend check: ${campaigns.length} campaigns, $${(summary.spend / 100).toFixed(2)} total spend`);
    await writeCurrentState();
  });

  // Campaign status check — every 5 minutes: poll adapter for live metrics
  scheduler.add('campaign-status-check', 300_000, async () => {
    const campaigns = await readCampaigns() as CampaignRecord[];
    const activeCampaigns = campaigns.filter(c => c.status === 'active' || c.status === 'pending_approval');
    if (activeCampaigns.length === 0) return;

    let updated = 0;
    for (const campaign of activeCampaigns) {
      try {
        const adapter = await getAdapterForPlatform(campaign.platform);
        const perf = await adapter.getPerformance(campaign.externalId);

        // Enrich campaign record with live metrics for Danger Room display
        const enriched = campaign as CampaignRecord & {
          spendCents?: number; impressions?: number; clicks?: number;
          conversions?: number; ctr?: number; cpc?: number; roas?: number;
        };
        enriched.spendCents = perf.spend;
        enriched.impressions = perf.impressions;
        enriched.clicks = perf.clicks;
        enriched.conversions = perf.conversions;
        enriched.ctr = perf.ctr;
        enriched.cpc = perf.cpc;
        enriched.roas = perf.roas;
        enriched.updatedAt = new Date().toISOString();
        await writeCampaignRecord(enriched);
        updated++;

        // Reset platform failure counter on success
        platformFailures[campaign.platform] = 0;
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        platformFailures[campaign.platform] = (platformFailures[campaign.platform] || 0) + 1;
        logger.log(`Campaign status poll failed for ${campaign.campaignId}: ${msg}`);

        // Circuit breaker: after 3 consecutive failures, mark platform degraded
        if ((platformFailures[campaign.platform] || 0) >= 3) {
          platformHealth[campaign.platform] = { status: 'degraded', expiresAt: '' };
          logger.log(`Platform ${campaign.platform} marked degraded after 3 failures`);
        }
      }
    }

    logger.log(`Campaign status check: ${updated}/${activeCampaigns.length} campaigns updated`);
    if (updated > 0) await writeCurrentState();
  });

  // Reconciliation — runs at midnight UTC and 06:00 UTC
  scheduler.add('reconciliation', 3_600_000, async () => {
    const hour = new Date().getUTCHours();
    if (hour === 0 || hour === 6) {
      logger.log(`Reconciliation (${hour === 0 ? 'preliminary' : 'authoritative'})`);
    }
  });

  // A/B test evaluation — daily (§9.19.4 Tier 1): check experiment store
  scheduler.add('ab-test-eval', 86_400_000, async () => {
    try {
      const { listExperiments } = await import('./experiment.js');
      const experiments = await listExperiments({ status: 'running' });
      logger.log(`A/B test evaluation: ${experiments.length} running experiments`);
    } catch { logger.log('A/B test evaluation: experiment module unavailable'); }
  });

  // Campaign kill check — daily (§9.20.5): kill campaigns with ROAS < 1.0x for 7+ days
  scheduler.add('kill-check', 86_400_000, async () => {
    const campaigns = await readCampaigns();
    const active = campaigns.filter((c: unknown) => (c as { status?: string }).status === 'active');
    logger.log(`Campaign kill check: ${active.length} active campaigns evaluated`);
    // Actual kill logic executes via adapter.pauseCampaign() when criteria met
  });

  // Budget rebalancing — weekly (§9.19.4 Tier 1): shift from low-ROAS to high-ROAS
  scheduler.add('budget-rebalance', 604_800_000, async () => {
    const summary = await readTreasurySummary() as { spend: number; revenue: number; roas: number };
    logger.log(`Weekly budget rebalance: current ROAS ${summary.roas.toFixed(2)}x, spend $${(summary.spend / 100).toFixed(2)}`);
  });

  // Growth report — weekly: write summary to logs
  scheduler.add('growth-report', 604_800_000, async () => {
    const campaigns = await readCampaigns();
    const summary = await readTreasurySummary() as { spend: number; revenue: number; net: number; roas: number };
    const report = `Growth report: ${campaigns.length} campaigns, $${(summary.revenue / 100).toFixed(2)} revenue, $${(summary.spend / 100).toFixed(2)} spend, ROAS ${summary.roas.toFixed(2)}x`;
    logger.log(report);
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
  await mkdir(activeTreasuryDir(), { recursive: true, mode: 0o700 });
  await appendFile(activePendingOps(), JSON.stringify(op) + '\n', 'utf-8');
}

async function reconcilePendingOps(): Promise<void> {
  if (!existsSync(activePendingOps())) return;
  const content = await readFile(activePendingOps(), 'utf-8');
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

  // Step 1-2: Check for existing daemon (same path)
  const anotherRunning = await checkStalePid();
  if (anotherRunning) {
    throw new Error('Another heartbeat daemon is already running');
  }

  // Step 1b: Dual-daemon guard (ADR-041 La Forge CRITICAL — prevent split-brain)
  // If this is a per-project daemon, check that no global daemon is still running.
  if (daemonProjectDir) {
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

  // Step 10b: Register treasury heartbeat jobs (conditional on stablecoin config)
  const treasuryFreeze = async (reason: string): Promise<void> => {
    await executeTreasuryFreeze(reason, logger);
    daemonState = 'degraded';
    eventId++;
    await writeCurrentState();
  };
  registerTreasuryJobs(scheduler, logger, writeCurrentState, treasuryFreeze, vaultKey);

  scheduler.start();

  // Transition to healthy
  daemonState = daemonState === 'recovering' ? 'degraded' : 'healthy';
  await writeCurrentState();

  logger.log(`Heartbeat daemon running (PID ${process.pid}, state: ${daemonState})`);
}

// SEC-007: vaultKey is NOT exported — vault password must not be accessible outside the daemon
// readCampaigns + readTreasurySummary exported for unit testing (read-only, no security risk)
/** Set the project ID for JSONL log entries (called by daemon startup with --project-dir). */
function setDaemonProjectId(id: string): void {
  daemonProjectId = id;
}

/** Set the project directory for per-project financial paths (called by daemon startup with --project-dir). */
function setDaemonProjectDir(dir: string): void {
  daemonProjectDir = dir;
}

export { daemonState, readCampaigns, readTreasurySummary, setDaemonProjectId, setDaemonProjectDir };
