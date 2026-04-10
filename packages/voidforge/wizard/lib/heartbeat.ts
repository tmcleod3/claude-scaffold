/**
 * Heartbeat Daemon — The single-writer for all financial state (ADR-1).
 *
 * This module implements the heartbeat daemon: a background Node.js process
 * that owns all financial state mutations. The CLI and Danger Room are clients
 * that communicate via the Unix domain socket API.
 *
 * PRD Reference: §9.7, §9.18, §9.19.2, §9.20.4, §9.20.11
 *
 * Structure (v23.2 split):
 *   heartbeat.ts            — daemon entry point, state, request handling, orchestration
 *   heartbeat-lifecycle.ts  — daemon startup/shutdown, WAL, campaign persistence types
 *   heartbeat-scheduler.ts  — scheduled job definitions
 */

import { join } from 'node:path';
import { homedir } from 'node:os';
import { existsSync } from 'node:fs';
import { readFile, mkdir } from 'node:fs/promises';

import {
  writeState, JobScheduler, createLogger,
} from './daemon-core.js';

import type { HeartbeatState, DaemonState } from './daemon-core.js';

import { financialVaultLock, financialVaultUnlock } from './financial-vault.js';
import { totpVerify, totpSessionInvalidate } from './totp.js';
import { classifyTier } from './safety-tiers.js';
import type { Cents } from './safety-tiers.js';
import type { SessionTokenState } from './oauth-core.js';
import { projectVaultLockAll } from './project-vault.js';

import { appendToLog, atomicWrite, getTreasuryDir, getSpendLog, getRevenueLog } from './financial-core.js';
import { TREASURY_SUMMARY_FILE, readTreasurySummaryFromLogs } from './treasury-reader.js';

import {
  registerTreasuryJobs, handleTreasuryRequest, executeTreasuryFreeze,
  getTreasuryStateSnapshot, isStablecoinConfigured,
} from './treasury-heartbeat.js';

import { getCampaignAdapter } from './financial/adapter-factory.js';
import { transition } from './campaign-state-machine.js';
import type { CampaignStatus } from './campaign-state-machine.js';
import type { CampaignConfig, AdPlatform } from './financial/campaign/base.js';

import {
  startDaemon, writePendingOp, getLastLogHash,
  validateCampaignId,
} from './heartbeat-lifecycle.js';
import type { CampaignRecord } from './heartbeat-lifecycle.js';
import { registerJobs } from './heartbeat-scheduler.js';

const VOIDFORGE_DIR = join(homedir(), '.voidforge');

// ── Daemon State ──────────────────────────────────────

let daemonState: DaemonState = 'starting';
let vaultKey: string | null = null;
let sessionTokenState: SessionTokenState | null = null;
let eventId = 0;
const logger = createLogger(join(VOIDFORGE_DIR, 'heartbeat.log'));
const daemonStartedAt = new Date().toISOString();

let daemonProjectId = 'global';
let daemonProjectDir: string | undefined;

function activeTreasuryDir(): string { return getTreasuryDir(daemonProjectDir); }
function activeSpendLog(): string { return getSpendLog(daemonProjectDir); }
function activeRevenueLog(): string { return getRevenueLog(daemonProjectDir); }
function activeCampaignsDir(): string { return join(activeTreasuryDir(), 'campaigns'); }

const platformFailures: Record<string, number> = {};
const platformHealth: Record<string, { status: string; expiresAt: string }> = {};

// ── Campaign Persistence ─────────────────────────────

async function writeCampaignRecord(record: CampaignRecord): Promise<void> {
  if (!validateCampaignId(record.campaignId)) {
    throw new Error(`Invalid campaign ID format: ${record.campaignId.slice(0, 20)}`);
  }
  await mkdir(activeCampaignsDir(), { recursive: true });
  await atomicWrite(join(activeCampaignsDir(), `${record.campaignId}.json`), JSON.stringify(record, null, 2));
}

async function readCampaignRecord(campaignId: string): Promise<CampaignRecord | null> {
  if (!validateCampaignId(campaignId)) return null;
  const filePath = join(activeCampaignsDir(), `${campaignId}.json`);
  try { return JSON.parse(await readFile(filePath, 'utf-8')) as CampaignRecord; }
  catch { return null; }
}

async function getActiveCampaignRecords(): Promise<CampaignRecord[]> {
  return ((await readCampaigns()) as CampaignRecord[]).filter(c => c.status === 'active');
}

async function getSuspendedCampaignRecords(): Promise<CampaignRecord[]> {
  return ((await readCampaigns()) as CampaignRecord[]).filter(c => c.status === 'suspended');
}

// ── State Management ──────────────────────────────────

async function readCampaigns(): Promise<unknown[]> {
  try {
    const { readdir } = await import('node:fs/promises');
    if (!existsSync(activeCampaignsDir())) return [];
    const files = await readdir(activeCampaignsDir());
    const campaigns: unknown[] = [];
    for (const file of files) {
      if (!file.endsWith('.json')) continue;
      try { campaigns.push(JSON.parse(await readFile(join(activeCampaignsDir(), file), 'utf-8'))); }
      catch { /* skip malformed */ }
    }
    return campaigns;
  } catch { return []; }
}

async function readTreasurySummary(): Promise<unknown> {
  try {
    let totalSpendCents = 0;
    let totalRevenueCents = 0;
    if (existsSync(activeSpendLog())) {
      for (const line of (await readFile(activeSpendLog(), 'utf-8')).trim().split('\n').filter(Boolean)) {
        try { totalSpendCents += Math.max(0, (JSON.parse(line) as { amountCents?: number }).amountCents ?? 0); }
        catch { /* skip */ }
      }
    }
    if (existsSync(activeRevenueLog())) {
      for (const line of (await readFile(activeRevenueLog(), 'utf-8')).trim().split('\n').filter(Boolean)) {
        try { totalRevenueCents += (JSON.parse(line) as { amountCents?: number }).amountCents ?? 0; }
        catch { /* skip */ }
      }
    }
    const net = totalRevenueCents - totalSpendCents;
    const roas = totalSpendCents > 0 ? totalRevenueCents / totalSpendCents : 0;
    return { revenue: totalRevenueCents, spend: totalSpendCents, net, roas, budgetRemaining: 0 };
  } catch {
    return { revenue: 0, spend: 0, net: 0, roas: 0, budgetRemaining: 0 };
  }
}

async function buildStateSnapshot(): Promise<HeartbeatState> {
  const campaigns = await readCampaigns();
  const activeCampaigns = campaigns.filter((c: unknown) => (c as { status?: string }).status === 'active').length;
  const summary = await readTreasurySummary() as { spend: number; revenue: number };
  const treasurySnapshot = isStablecoinConfigured() ? getTreasuryStateSnapshot() : undefined;
  const alerts: string[] = [];
  if (treasurySnapshot?.fundingFrozen) {
    alerts.push(`Funding frozen: ${treasurySnapshot.freezeReason ?? 'unknown reason'}`);
  }
  return {
    pid: process.pid, state: daemonState, startedAt: daemonStartedAt,
    lastHeartbeat: new Date().toISOString(), lastEventId: eventId,
    cultivationState: daemonState === 'starting' ? 'inactive' : 'active',
    activePlatforms: Object.keys(platformHealth), activeCampaigns,
    todaySpend: summary.spend as Cents, dailyBudget: 0 as Cents,
    alerts, tokenHealth: platformHealth,
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
  await writeTreasurySummaryFile();
}

async function writeTreasurySummaryFile(): Promise<void> {
  try {
    const treasuryDir = activeTreasuryDir();
    await mkdir(treasuryDir, { recursive: true });
    const snap = isStablecoinConfigured() ? getTreasuryStateSnapshot() : null;
    const hb = snap ? {
      stablecoinBalanceCents: snap.stablecoinBalanceCents,
      bankAvailableCents: snap.bankBalanceCents, bankReservedCents: 0,
      runwayDays: snap.runwayDays,
      fundingState: snap.fundingFrozen ? 'frozen'
        : snap.runwayDays > 0 && snap.runwayDays < 7 ? 'degraded'
        : snap.runwayDays > 0 ? 'healthy' : null,
      nextTreasuryEvent: null,
    } : undefined;
    const summary = await readTreasurySummaryFromLogs(treasuryDir, hb);
    await atomicWrite(join(treasuryDir, TREASURY_SUMMARY_FILE), JSON.stringify({ ...summary, timestamp: new Date().toISOString() }));
  } catch { /* Non-fatal — summary is a cache */ }
}

// ── Command Handlers ──────────────────────────────────

async function handleFreeze(): Promise<{ status: number; body: unknown }> {
  logger.log('FREEZE command received — pausing all active campaigns');
  const activeCampaigns = await getActiveCampaignRecords();
  let pausedCount = 0;
  const errors: string[] = [];
  for (const campaign of activeCampaigns) {
    try {
      const adapter = await getCampaignAdapter(campaign.platform, vaultKey, logger);
      await adapter.pauseCampaign(campaign.externalId);
      campaign.status = transition(campaign.status, 'suspended', 'cli', 'freeze').newStatus as CampaignStatus;
      campaign.updatedAt = new Date().toISOString();
      await writeCampaignRecord(campaign);
      pausedCount++;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`${campaign.campaignId}: ${msg}`);
      logger.log(`Freeze: failed to pause campaign ${campaign.campaignId}: ${msg}`);
    }
  }
  daemonState = 'degraded'; eventId++; await writeCurrentState();
  const allPaused = errors.length === 0;
  logger.log(`Freeze complete: ${pausedCount}/${activeCampaigns.length} campaigns paused${allPaused ? '' : ` (${errors.length} failures)`}`);
  return {
    status: allPaused ? 200 : 207,
    body: {
      ok: allPaused,
      message: allPaused ? `Freeze complete: ${pausedCount} campaigns paused`
        : `Freeze partial: ${pausedCount}/${activeCampaigns.length} campaigns paused, ${errors.length} failed`,
      pausedCount, totalCampaigns: activeCampaigns.length,
      errors: errors.length > 0 ? errors : undefined,
    },
  };
}

async function handleUnfreeze(): Promise<{ status: number; body: unknown }> {
  logger.log('UNFREEZE command received — resuming suspended campaigns');
  const suspended = await getSuspendedCampaignRecords();
  let resumedCount = 0;
  const errors: string[] = [];
  for (const campaign of suspended) {
    try {
      const adapter = await getCampaignAdapter(campaign.platform, vaultKey, logger);
      await adapter.resumeCampaign(campaign.externalId);
      campaign.status = transition(campaign.status, 'active', 'cli', 'unfreeze').newStatus as CampaignStatus;
      campaign.updatedAt = new Date().toISOString();
      await writeCampaignRecord(campaign);
      resumedCount++;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`${campaign.campaignId}: ${msg}`);
      logger.log(`Unfreeze: failed to resume campaign ${campaign.campaignId}: ${msg}`);
    }
  }
  daemonState = 'healthy'; eventId++; await writeCurrentState();
  logger.log(`Unfreeze complete: ${resumedCount}/${suspended.length} campaigns resumed`);
  return { status: 200, body: { ok: true, message: `Spending resumed: ${resumedCount} campaigns unfrozen`, resumedCount, errors: errors.length > 0 ? errors : undefined } };
}

async function handleUnlock(body: { password?: string }): Promise<{ status: number; body: unknown }> {
  if (!body.password) return { status: 400, body: { ok: false, error: 'Password required' } };
  const valid = await financialVaultUnlock(body.password);
  if (!valid) { logger.log('Vault unlock failed — wrong password'); return { status: 403, body: { ok: false, error: 'Invalid vault password' } }; }
  vaultKey = body.password;
  if (daemonState === 'degraded') daemonState = 'healthy';
  logger.log('Vault unlocked'); eventId++; await writeCurrentState();
  return { status: 200, body: { ok: true, message: 'Vault session renewed' } };
}

async function handleCampaignPause(id: string): Promise<{ status: number; body: unknown }> {
  logger.log(`Campaign ${id} pause requested`);
  const record = await readCampaignRecord(id);
  if (!record) return { status: 404, body: { ok: false, error: `Campaign not found: ${id}` } };
  try {
    const adapter = await getCampaignAdapter(record.platform, vaultKey, logger);
    await adapter.pauseCampaign(record.externalId);
    record.status = transition(record.status, 'paused', 'cli', 'user_paused').newStatus as CampaignStatus;
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
  if (!record) return { status: 404, body: { ok: false, error: `Campaign not found: ${id}` } };
  try {
    const adapter = await getCampaignAdapter(record.platform, vaultKey, logger);
    await adapter.resumeCampaign(record.externalId);
    record.status = transition(record.status, 'active', 'cli', 'user_resumed').newStatus as CampaignStatus;
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
  const config = body as { name?: string; platform?: AdPlatform; objective?: string; dailyBudgetCents?: number; idempotencyKey?: string; targeting?: CampaignConfig['targeting']; creative?: CampaignConfig['creative'] };
  if (!config.name || !config.platform || !config.dailyBudgetCents || !config.idempotencyKey) {
    return { status: 400, body: { ok: false, error: 'Missing required fields: name, platform, dailyBudgetCents, idempotencyKey' } };
  }
  if (!Number.isFinite(config.dailyBudgetCents) || config.dailyBudgetCents <= 0 || !Number.isInteger(config.dailyBudgetCents)) {
    return { status: 400, body: { ok: false, error: 'dailyBudgetCents must be a positive integer' } };
  }
  const activeCampaigns = await getActiveCampaignRecords();
  const aggregateDailySpend = activeCampaigns.reduce((sum, c) => (sum + (c.dailyBudgetCents || 0)) as Cents, 0 as Cents);
  const tierResult = classifyTier(config.dailyBudgetCents as Cents, aggregateDailySpend);
  if (tierResult.tier !== 'auto_approve') {
    logger.log(`Campaign launch: budget $${(config.dailyBudgetCents / 100).toFixed(2)} + aggregate $${(aggregateDailySpend / 100).toFixed(2)}/day → ${tierResult.tier} (${tierResult.reason})`);
    if (tierResult.requiresTotp) return { status: 403, body: { ok: false, error: `Budget tier: ${tierResult.tier}. ${tierResult.reason}. Requires TOTP.` } };
  }
  try {
    const adapter = await getCampaignAdapter(config.platform, vaultKey, logger);
    const campaignConfig: CampaignConfig = {
      name: config.name, platform: config.platform,
      objective: (config.objective as CampaignConfig['objective']) ?? 'traffic',
      dailyBudget: config.dailyBudgetCents as Cents,
      targeting: config.targeting ?? { audiences: [], locations: [] },
      creative: config.creative ?? { headlines: [], descriptions: [], callToAction: '', landingUrl: '' },
      idempotencyKey: config.idempotencyKey, complianceStatus: 'passed',
    };
    await writePendingOp({ intentId: config.idempotencyKey, operation: 'campaign_launch', platform: config.platform, params: campaignConfig, status: 'pending', createdAt: new Date().toISOString() }, activeTreasuryDir());
    const result = await adapter.createCampaign(campaignConfig);
    const campaignId = config.idempotencyKey;
    const now = new Date().toISOString();
    const record: CampaignRecord = {
      campaignId, externalId: result.externalId, platform: config.platform,
      status: result.status === 'pending_review' ? 'pending_approval' : 'active',
      name: config.name, dailyBudgetCents: config.dailyBudgetCents, createdAt: now, updatedAt: now,
    };
    await writeCampaignRecord(record);
    await appendToLog(activeSpendLog(), { type: 'campaign_launch', campaignId, projectId: daemonProjectId, externalId: result.externalId, platform: config.platform, dailyBudgetCents: config.dailyBudgetCents, timestamp: now }, await getLastLogHash(activeSpendLog()));
    eventId++;
    logger.log(`Campaign launched: ${campaignId} → ${result.externalId} on ${config.platform} (status: ${record.status})`);
    return { status: 200, body: { ok: true, campaignId, externalId: result.externalId, platform: config.platform, status: record.status, dashboardUrl: result.dashboardUrl } };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.log(`Campaign launch failed: ${msg}`);
    return { status: 500, body: { ok: false, error: `Launch failed: ${msg}` } };
  }
}

async function handleBudgetChange(body: unknown): Promise<{ status: number; body: unknown }> {
  logger.log('Budget change requested');
  const params = body as { campaignId?: string; newBudgetCents?: number };
  if (!params.campaignId || params.newBudgetCents === undefined) return { status: 400, body: { ok: false, error: 'Missing required fields: campaignId, newBudgetCents' } };
  if (!Number.isFinite(params.newBudgetCents) || params.newBudgetCents <= 0 || !Number.isInteger(params.newBudgetCents)) return { status: 400, body: { ok: false, error: 'newBudgetCents must be a positive integer' } };
  const activeBudgets = await getActiveCampaignRecords();
  const currentAggregate = activeBudgets.reduce((sum, c) => (sum + (c.dailyBudgetCents || 0)) as Cents, 0 as Cents);
  const tierResult = classifyTier(params.newBudgetCents as Cents, currentAggregate);
  if (tierResult.requiresTotp) return { status: 403, body: { ok: false, error: `Budget tier: ${tierResult.tier}. ${tierResult.reason}. Requires TOTP.` } };
  await writePendingOp({ intentId: `budget_${params.campaignId}_${Date.now()}`, operation: 'budget_change', platform: 'unknown', params, status: 'pending', createdAt: new Date().toISOString() }, activeTreasuryDir());
  const record = await readCampaignRecord(params.campaignId);
  if (!record) return { status: 404, body: { ok: false, error: `Campaign not found: ${params.campaignId}` } };
  try {
    const adapter = await getCampaignAdapter(record.platform, vaultKey, logger);
    await adapter.updateBudget(record.externalId, params.newBudgetCents as Cents);
    const oldBudget = record.dailyBudgetCents;
    record.dailyBudgetCents = params.newBudgetCents;
    record.updatedAt = new Date().toISOString();
    await writeCampaignRecord(record);
    await appendToLog(activeSpendLog(), { type: 'budget_change', campaignId: params.campaignId, projectId: daemonProjectId, oldBudgetCents: oldBudget, newBudgetCents: params.newBudgetCents, timestamp: record.updatedAt }, await getLastLogHash(activeSpendLog()));
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
  if (!record) return { status: 404, body: { ok: false, error: `Campaign not found: ${id}` } };
  const creative = body as { headlines?: string[]; descriptions?: string[]; callToAction?: string; landingUrl?: string; imageUrls?: string[] };
  try {
    const adapter = await getCampaignAdapter(record.platform, vaultKey, logger);
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
    const report = await runReconciliation('default', today, type, new Map(), new Map());
    return { status: 200, body: { ok: true, message: `Reconciliation (${type}) completed`, report } };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Reconciliation failed';
    logger.log(`Reconciliation error: ${message}`);
    return { status: 500, body: { ok: false, error: `Reconciliation failed: ${message}` } };
  }
}

// ── Socket API Request Handler (§9.20.11) ─────────────

async function handleRequest(
  method: string, path: string, body: unknown,
  auth: { hasToken: boolean; vaultPassword: string; totpCode: string },
): Promise<{ status: number; body: unknown }> {
  if (!auth.hasToken) return { status: 401, body: { ok: false, error: 'Session token required' } };

  // SEC-001 + R4-MAUL-001: HMAC vault password comparison (constant-time)
  let vaultVerified = false;
  if (auth.vaultPassword && vaultKey) {
    const { createHmac, timingSafeEqual } = await import('node:crypto');
    const HMAC_KEY = 'voidforge-vault-password-comparison-v1';
    const providedMac = createHmac('sha256', HMAC_KEY).update(auth.vaultPassword).digest();
    const expectedMac = createHmac('sha256', HMAC_KEY).update(vaultKey).digest();
    vaultVerified = timingSafeEqual(providedMac, expectedMac);
  }
  let totpVerified = false;
  if (auth.totpCode) { try { totpVerified = await totpVerify(auth.totpCode); } catch { /* not configured */ } }

  // ── Treasury routes ──
  const treasuryFreeze = async (reason: string): Promise<void> => {
    await executeTreasuryFreeze(reason, logger);
    daemonState = 'degraded'; eventId++; await writeCurrentState();
  };
  if (path.startsWith('/treasury/')) {
    const result = await handleTreasuryRequest(method, path, body, { vaultVerified, totpVerified }, logger, treasuryFreeze, vaultKey);
    if (result) { eventId++; return result; }
  }

  // ── GET ──
  if (method === 'GET') {
    if (path === '/status') return { status: 200, body: { ok: true, data: await buildStateSnapshot() } };
    if (path === '/campaigns') return { status: 200, body: { ok: true, data: await readCampaigns() } };
    if (path === '/treasury') return { status: 200, body: { ok: true, data: await readTreasurySummary() } };
    return { status: 404, body: { ok: false, error: 'Unknown endpoint' } };
  }

  // ── POST ──
  if (method === 'POST') {
    if (path === '/freeze') return await handleFreeze();
    if (path === '/unfreeze') {
      if (!vaultVerified || !totpVerified) return { status: 403, body: { ok: false, error: 'Unfreeze requires valid vault password + TOTP code' } };
      return await handleUnfreeze();
    }
    if (path === '/unlock') return await handleUnlock(body as { password?: string });
    if (path.match(/^\/campaigns\/[^/]+\/pause$/)) return await handleCampaignPause(path.split('/')[2]);
    if (path.match(/^\/campaigns\/[^/]+\/creative$/)) return await handleCreativeUpdate(path.split('/')[2], body);
    if (path.match(/^\/campaigns\/[^/]+\/resume$/)) {
      if (!vaultVerified) return { status: 403, body: { ok: false, error: 'Resume requires valid vault password' } };
      return await handleCampaignResume(path.split('/')[2]);
    }
    if (path === '/campaigns/launch') {
      if (!vaultVerified) return { status: 403, body: { ok: false, error: 'Campaign launch requires valid vault password' } };
      return await handleCampaignLaunch(body);
    }
    if (path === '/budget') {
      if (!vaultVerified) return { status: 403, body: { ok: false, error: 'Budget changes require valid vault password' } };
      return await handleBudgetChange(body);
    }
    if (path === '/reconcile') return await handleReconcile();
    return { status: 404, body: { ok: false, error: 'Unknown endpoint' } };
  }
  return { status: 405, body: { ok: false, error: 'Method not allowed' } };
}

// ── Main Entry Point ──────────────────────────────────

export async function startHeartbeat(vaultPassword: string): Promise<void> {
  const { server: _server } = await startDaemon(vaultPassword, {
    logger,
    getDaemonState: () => daemonState,
    setDaemonState: (s) => { daemonState = s; },
    setVaultKey: (k) => { vaultKey = k; },
    setSessionTokenState: (s) => { sessionTokenState = s; },
    getDaemonProjectDir: () => daemonProjectDir,
    writeCurrentState,
    onShutdown: async () => {
      logger.log('Shutting down gracefully');
      daemonState = 'shutting_down';
      await writeCurrentState();
      financialVaultLock();
      projectVaultLockAll();
      totpSessionInvalidate();
      logger.close();
    },
    handleRequest,
    activeTreasuryDir,
  });

  // Start job scheduler
  const scheduler = new JobScheduler();
  registerJobs(scheduler, {
    logger, get vaultKey() { return vaultKey; },
    activeTreasuryDir, writeCurrentState, readCampaigns, readTreasurySummary,
  }, platformHealth, platformFailures);

  // Register treasury heartbeat jobs
  const treasuryFreeze = async (reason: string): Promise<void> => {
    await executeTreasuryFreeze(reason, logger);
    daemonState = 'degraded'; eventId++; await writeCurrentState();
  };
  registerTreasuryJobs(scheduler, logger, writeCurrentState, treasuryFreeze, vaultKey);
  scheduler.start();

  // Transition to healthy
  daemonState = daemonState === 'recovering' ? 'degraded' : 'healthy';
  await writeCurrentState();
  logger.log(`Heartbeat daemon running (PID ${process.pid}, state: ${daemonState})`);
}

// SEC-007: vaultKey is NOT exported
function setDaemonProjectId(id: string): void { daemonProjectId = id; }
function setDaemonProjectDir(dir: string): void { daemonProjectDir = dir; }

export { daemonState, readCampaigns, readTreasurySummary, setDaemonProjectId, setDaemonProjectDir };
