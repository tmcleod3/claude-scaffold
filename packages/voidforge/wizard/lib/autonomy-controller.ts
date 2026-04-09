/**
 * Autonomy Controller — Tier 2 supervised + Tier 3 full autonomy (v12.3-v12.4).
 *
 * Manages the autonomous execution loop: proposal → delay → execute/veto.
 * Implements circuit breakers, kill switch, deploy freeze, strategic sync.
 *
 * PRD Reference: ROADMAP v12.3-v12.4, DEEP_CURRENT.md Autonomy Tiers + Security
 */

import { existsSync } from 'node:fs';
import { readFile, open, rename, mkdir } from 'node:fs/promises';
import { join } from 'node:path';

import type { CampaignProposal } from './campaign-proposer.js';
import type { SituationModel } from './deep-current.js';
import { deepCurrentDir } from './deep-current.js';
import { findProjectRoot } from './marker.js';

// ── Autonomy State ────────────────────────────────────

interface AutonomyState {
  tier: 1 | 2 | 3;
  active: boolean;                 // Is the autonomous loop running?
  stopped: boolean;                // Kill switch engaged?
  pendingProposal?: {
    proposal: CampaignProposal;
    proposedAt: string;
    executeAt: string;             // Tier 2: 24h after proposedAt
    vetoed: boolean;
  };
  campaignsRun: number;            // Total autonomous campaigns
  consecutiveCampaigns: number;    // Since last human review
  lastHumanReview: string;         // ISO 8601
  lastStrategicSync: string;       // ISO 8601 — 30-day mandatory check
  circuitBreakers: {
    driftScore: number;            // 0-100 — >30 triggers pause
    consecutiveCriticals: number;  // 3+ triggers Tier 1 fallback
    spendIncreaseStreak: number;   // 7 consecutive days → pause
    roasBelow1: number;            // Days ROAS < 1.0x → freeze at 7
  };
  deployFreezeWindows: Array<{ dayOfWeek: number; startHour: number; endHour: number }>; // UTC
}

function getAutonomyStatePath(): string { return join(deepCurrentDir(findProjectRoot() ?? process.cwd()), 'autonomy-state.json'); }

const DEFAULT_STATE: AutonomyState = {
  tier: 1,
  active: false,
  stopped: false,
  campaignsRun: 0,
  consecutiveCampaigns: 0,
  lastHumanReview: new Date().toISOString(),
  lastStrategicSync: new Date().toISOString(),
  circuitBreakers: {
    driftScore: 0,
    consecutiveCriticals: 0,
    spendIncreaseStreak: 0,
    roasBelow1: 0,
  },
  deployFreezeWindows: [],
};

// ── State Persistence ─────────────────────────────────

export async function loadAutonomyState(): Promise<AutonomyState> {
  if (!existsSync(getAutonomyStatePath())) return { ...DEFAULT_STATE };
  try {
    const content = await readFile(getAutonomyStatePath(), 'utf-8');
    return JSON.parse(content) as AutonomyState;
  } catch { return { ...DEFAULT_STATE }; }
}

// IG-R4 LOKI-001: Serialization queue prevents concurrent write corruption
let writeQueue: Promise<void> = Promise.resolve();
function serialized<T>(fn: () => Promise<T>): Promise<T> {
  const result = writeQueue.then(fn, () => fn());
  writeQueue = result.then(() => {}, () => {});
  return result;
}

export function saveAutonomyState(state: AutonomyState): Promise<void> {
  return serialized(async () => {
    await mkdir(deepCurrentDir(findProjectRoot() ?? process.cwd()), { recursive: true });
    // IG-R4 LOKI-001: Atomic write — temp+fsync+rename prevents kill switch reset on crash
    const tmpPath = getAutonomyStatePath() + '.tmp';
    const fh = await open(tmpPath, 'w', 0o600);
    try {
      await fh.writeFile(JSON.stringify(state, null, 2));
      await fh.sync();
    } finally { await fh.close(); }
    await rename(tmpPath, getAutonomyStatePath());
  });
}

// ── Circuit Breakers ──────────────────────────────────

interface CircuitBreakerResult {
  safe: boolean;
  reason?: string;
  action?: 'pause' | 'downgrade_to_tier1' | 'stop';
}

/**
 * Check all circuit breakers. Returns whether autonomous operation should continue.
 */
export function checkCircuitBreakers(state: AutonomyState): CircuitBreakerResult {
  // Kill switch
  if (state.stopped) {
    return { safe: false, reason: 'Kill switch engaged (/current --stop)', action: 'stop' };
  }

  // Strategic drift > 30%
  if (state.circuitBreakers.driftScore > 30) {
    return { safe: false, reason: `Strategic drift score ${state.circuitBreakers.driftScore}% exceeds 30% threshold`, action: 'pause' };
  }

  // 3+ consecutive campaigns with increasing Criticals
  if (state.circuitBreakers.consecutiveCriticals >= 3) {
    return { safe: false, reason: `${state.circuitBreakers.consecutiveCriticals} consecutive campaigns with increasing Critical findings`, action: 'downgrade_to_tier1' };
  }

  // 7 consecutive days of increasing spend
  if (state.circuitBreakers.spendIncreaseStreak >= 7) {
    return { safe: false, reason: '7 consecutive days of increasing daily spend — human review required', action: 'pause' };
  }

  // ROAS < 1.0x for 7+ days
  if (state.circuitBreakers.roasBelow1 >= 7) {
    return { safe: false, reason: 'Blended ROAS below 1.0x for 7+ days — losing money', action: 'pause' };
  }

  // 30-day strategic sync overdue
  const syncAge = Date.now() - new Date(state.lastStrategicSync).getTime();
  const thirtyDays = 30 * 24 * 60 * 60 * 1000;
  if (syncAge > thirtyDays) {
    return { safe: false, reason: '30-day mandatory strategic sync overdue', action: 'pause' };
  }

  // 10-campaign human checkpoint (Tier 3 only)
  if (state.tier === 3 && state.consecutiveCampaigns >= 10) {
    return { safe: false, reason: '10 autonomous campaigns since last human review', action: 'pause' };
  }

  // Deploy freeze window check
  if (isInDeployFreeze(state)) {
    return { safe: false, reason: 'Currently in deploy freeze window', action: 'pause' };
  }

  return { safe: true };
}

function isInDeployFreeze(state: AutonomyState): boolean {
  if (state.deployFreezeWindows.length === 0) return false;
  const now = new Date();
  const dayOfWeek = now.getUTCDay();
  const hour = now.getUTCHours();

  return state.deployFreezeWindows.some(w =>
    w.dayOfWeek === dayOfWeek && hour >= w.startHour && hour < w.endHour
  );
}

// ── Tier 2: Supervised Autonomy ───────────────────────

/**
 * Queue a proposal for Tier 2 execution (24h delay).
 */
export function queueProposal(state: AutonomyState, proposal: CampaignProposal): AutonomyState {
  const proposedAt = new Date();
  const executeAt = new Date(proposedAt.getTime() + 24 * 60 * 60 * 1000); // 24h delay

  state.pendingProposal = {
    proposal,
    proposedAt: proposedAt.toISOString(),
    executeAt: executeAt.toISOString(),
    vetoed: false,
  };

  return state;
}

/**
 * Check if a pending Tier 2 proposal is ready to execute.
 */
export function isProposalReady(state: AutonomyState): boolean {
  if (!state.pendingProposal) return false;
  if (state.pendingProposal.vetoed) return false;
  if (state.tier === 3) return true; // Tier 3: immediate execution
  // Tier 2: execute after delay
  return Date.now() >= new Date(state.pendingProposal.executeAt).getTime();
}

/**
 * Veto a pending Tier 2 proposal.
 */
export function vetoProposal(state: AutonomyState): AutonomyState {
  if (state.pendingProposal) {
    state.pendingProposal.vetoed = true;
  }
  return state;
}

// ── Kill Switch ───────────────────────────────────────

export function engageKillSwitch(state: AutonomyState): AutonomyState {
  state.stopped = true;
  state.active = false;
  state.pendingProposal = undefined;
  return state;
}

export function disengageKillSwitch(state: AutonomyState): AutonomyState {
  state.stopped = false;
  return state;
}

// ── Strategic Sync ────────────────────────────────────

export function recordStrategicSync(state: AutonomyState): AutonomyState {
  state.lastStrategicSync = new Date().toISOString();
  state.lastHumanReview = new Date().toISOString();
  state.consecutiveCampaigns = 0;
  return state;
}

export function recordCampaignComplete(state: AutonomyState): AutonomyState {
  state.campaignsRun += 1;
  state.consecutiveCampaigns += 1;
  state.pendingProposal = undefined;
  return state;
}

// ── Soft Limits ───────────────────────────────────────

interface SoftLimits {
  maxConsecutiveMissions: number;     // Default: 5
  maxDeploysPerDay: number;           // Default: 1
  aggregateDailySpendCeiling: number; // Cents, default: 5000 ($50)
  strategicDriftThreshold: number;    // Default: 30 (percent)
  explorationBudgetPercent: number;   // Default: 10
  lessonDecayHalfLifeDays: number;    // Default: 90
  minRoasBeforeFreeze: number;        // Default: 1.0
}

const DEFAULT_SOFT_LIMITS: SoftLimits = {
  maxConsecutiveMissions: 5,
  maxDeploysPerDay: 1,
  aggregateDailySpendCeiling: 5000,
  strategicDriftThreshold: 30,
  explorationBudgetPercent: 10,
  lessonDecayHalfLifeDays: 90,
  minRoasBeforeFreeze: 1.0,
};

export type { AutonomyState, CircuitBreakerResult, SoftLimits };
export { DEFAULT_STATE, DEFAULT_SOFT_LIMITS, getAutonomyStatePath };
