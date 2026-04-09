/**
 * Treasury Reader — Shared read-only functions for treasury data.
 *
 * Extracted from danger-room.ts heartbeat endpoint (ADR-041 M0.3).
 * Reads treasury files from a given directory path. Used by both the
 * Danger Room API and the Lobby aggregation endpoint.
 *
 * This module is READ-ONLY. The heartbeat daemon is the single writer (ADR-1).
 */

import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { existsSync } from 'node:fs';
import { readFileOrNull } from './http-helpers.js';

// ── Types ────────────────────────────────────────────

export interface TreasurySummary {
  revenue: number;
  spend: number;
  net: number;
  roas: number;
  budgetRemaining: number;
  stablecoinBalance: number | null;
  pendingOfframps: number;
  bankAvailable: number | null;
  bankReserved: number | null;
  runwayDays: number | null;
  fundingState: string | null;
  nextTreasuryEvent: string | null;
  unsettledInvoices: number;
  reconciliationStatus: string | null;
}

export interface HeartbeatSnapshot {
  cultivationInstalled: boolean;
  heartbeat: unknown;
  campaigns: unknown[];
  treasury: TreasurySummary;
}

const EMPTY_TREASURY: TreasurySummary = {
  revenue: 0, spend: 0, net: 0, roas: 0, budgetRemaining: 0,
  stablecoinBalance: null, pendingOfframps: 0,
  bankAvailable: null, bankReserved: null,
  runwayDays: null, fundingState: null,
  nextTreasuryEvent: null, unsettledInvoices: 0,
  reconciliationStatus: null,
};

// ── Readers ──────────────────────────────────────────

/**
 * Read full heartbeat snapshot from a treasury directory.
 *
 * @param treasuryDir — Path to treasury directory (e.g., project/cultivation/treasury/)
 * @param stateFilePath — Path to heartbeat.json state file
 * @param vaultCheckPath — Path to vault.enc (used to detect cultivation installation)
 */
export async function readHeartbeatSnapshot(
  treasuryDir: string,
  stateFilePath: string,
  vaultCheckPath: string,
): Promise<HeartbeatSnapshot> {
  let cultivationInstalled = false;
  let heartbeatData: unknown = null;

  try {
    cultivationInstalled = existsSync(vaultCheckPath);
    const raw = await readFileOrNull(stateFilePath);
    if (raw) heartbeatData = JSON.parse(raw);
  } catch { /* no heartbeat data */ }

  const campaigns = await readCampaigns(join(treasuryDir, 'campaigns'));
  const treasury = await readTreasurySummary(treasuryDir, heartbeatData);

  return { cultivationInstalled, heartbeat: heartbeatData, campaigns, treasury };
}

/** Read campaign JSON files from a campaigns directory. */
async function readCampaigns(campaignsDir: string): Promise<unknown[]> {
  const campaigns: unknown[] = [];
  try {
    if (!existsSync(campaignsDir)) return campaigns;
    const files = await readdir(campaignsDir);
    for (const file of files) {
      if (!file.endsWith('.json')) continue;
      try {
        const content = await readFile(join(campaignsDir, file), 'utf-8');
        campaigns.push(JSON.parse(content));
      } catch { /* skip malformed campaign files */ }
    }
  } catch { /* no campaigns directory */ }
  return campaigns;
}

/** Filename for the cached summary written by the daemon (v22.1 M2). */
export const TREASURY_SUMMARY_FILE = 'treasury-summary.json';

/**
 * Read treasury summary. Tries the O(1) cached summary file first (written by
 * the heartbeat daemon after each financial operation). Falls back to O(n)
 * JSONL log scan if the summary file doesn't exist or is unreadable.
 */
export async function readTreasurySummary(
  treasuryDir: string,
  heartbeatData?: unknown,
): Promise<TreasurySummary> {
  // O(1) path: read cached summary (written by daemon — ADR-1 single writer)
  const summaryPath = join(treasuryDir, TREASURY_SUMMARY_FILE);
  try {
    if (existsSync(summaryPath)) {
      const raw = await readFile(summaryPath, 'utf-8');
      const cached = JSON.parse(raw) as TreasurySummary & { timestamp?: string };
      // Validate it has the required shape (at minimum, spend + revenue)
      if (typeof cached.spend === 'number' && typeof cached.revenue === 'number') {
        return {
          revenue: cached.revenue,
          spend: cached.spend,
          net: cached.net ?? cached.revenue - cached.spend,
          roas: cached.roas ?? (cached.spend > 0 ? cached.revenue / cached.spend : 0),
          budgetRemaining: cached.budgetRemaining ?? 0,
          stablecoinBalance: cached.stablecoinBalance ?? null,
          pendingOfframps: cached.pendingOfframps ?? 0,
          bankAvailable: cached.bankAvailable ?? null,
          bankReserved: cached.bankReserved ?? null,
          runwayDays: cached.runwayDays ?? null,
          fundingState: cached.fundingState ?? null,
          nextTreasuryEvent: cached.nextTreasuryEvent ?? null,
          unsettledInvoices: cached.unsettledInvoices ?? 0,
          reconciliationStatus: cached.reconciliationStatus ?? null,
        };
      }
    }
  } catch { /* summary file missing or corrupt — fall through to JSONL scan */ }

  // O(n) fallback: scan JSONL logs directly
  return readTreasurySummaryFromLogs(treasuryDir, heartbeatData);
}

/**
 * O(n) JSONL log scan — the original read path before v22.1.
 * Used as fallback when treasury-summary.json is unavailable.
 */
export async function readTreasurySummaryFromLogs(
  treasuryDir: string,
  heartbeatData?: unknown,
): Promise<TreasurySummary> {
  try {
    const spendLogPath = join(treasuryDir, 'spend-log.jsonl');
    const revenueLogPath = join(treasuryDir, 'revenue-log.jsonl');
    let totalSpendCents = 0;
    let totalRevenueCents = 0;

    if (existsSync(spendLogPath)) {
      const lines = (await readFile(spendLogPath, 'utf-8')).trim().split('\n').filter(Boolean);
      for (const line of lines) {
        try {
          const entry = JSON.parse(line) as { amountCents?: number };
          totalSpendCents += Math.max(0, entry.amountCents ?? 0);
        } catch { /* skip malformed lines */ }
      }
    }

    if (existsSync(revenueLogPath)) {
      const lines = (await readFile(revenueLogPath, 'utf-8')).trim().split('\n').filter(Boolean);
      for (const line of lines) {
        try {
          const entry = JSON.parse(line) as { amountCents?: number };
          totalRevenueCents += entry.amountCents ?? 0;
        } catch { /* skip malformed lines */ }
      }
    }

    const net = totalRevenueCents - totalSpendCents;
    const roas = totalSpendCents > 0 ? totalRevenueCents / totalSpendCents : 0;

    let budgetRemaining = 0;
    const budgetsFile = join(treasuryDir, 'budgets.json');
    if (existsSync(budgetsFile)) {
      try {
        const budgetData = JSON.parse(await readFile(budgetsFile, 'utf-8')) as { totalBudgetCents?: number };
        budgetRemaining = (budgetData.totalBudgetCents ?? 0) - totalSpendCents;
      } catch { /* skip malformed budgets */ }
    }

    // ── Stablecoin funding data ──
    let stablecoinBalance: number | null = null;
    let pendingOfframps = 0;
    let bankAvailable: number | null = null;
    let bankReserved: number | null = null;
    let runwayDays: number | null = null;
    let fundingState: string | null = null;
    let nextTreasuryEvent: string | null = null;
    let unsettledInvoices = 0;
    let reconciliationStatus: string | null = null;

    const fundingConfigPath = join(treasuryDir, 'funding-config.json.enc');
    if (existsSync(fundingConfigPath) && heartbeatData) {
      const hb = heartbeatData as Record<string, unknown>;
      if (typeof hb.stablecoinBalanceCents === 'number') stablecoinBalance = hb.stablecoinBalanceCents;
      if (typeof hb.bankAvailableCents === 'number') bankAvailable = hb.bankAvailableCents;
      if (typeof hb.bankReservedCents === 'number') bankReserved = hb.bankReservedCents;
      if (typeof hb.runwayDays === 'number') runwayDays = hb.runwayDays;
      if (typeof hb.fundingState === 'string') fundingState = hb.fundingState;
      if (typeof hb.nextTreasuryEvent === 'string') nextTreasuryEvent = hb.nextTreasuryEvent;
    }

    const fundingPlansLog = join(treasuryDir, 'funding-plans.jsonl');
    if (existsSync(fundingPlansLog)) {
      try {
        const lines = (await readFile(fundingPlansLog, 'utf-8')).trim().split('\n').filter(Boolean);
        for (const line of lines) {
          try {
            const plan = JSON.parse(line) as { status?: string };
            if (plan.status === 'PENDING_SETTLEMENT' || plan.status === 'APPROVED') unsettledInvoices++;
          } catch { /* skip malformed lines */ }
        }
      } catch { /* skip read errors */ }
    }

    const transfersLog = join(treasuryDir, 'transfers.jsonl');
    if (existsSync(transfersLog)) {
      try {
        const lines = (await readFile(transfersLog, 'utf-8')).trim().split('\n').filter(Boolean);
        for (const line of lines) {
          try {
            const transfer = JSON.parse(line) as { status?: string; direction?: string };
            if ((transfer.status === 'pending' || transfer.status === 'processing')
                && transfer.direction === 'crypto_to_fiat') pendingOfframps++;
          } catch { /* skip malformed lines */ }
        }
      } catch { /* skip read errors */ }
    }

    const reconciliationLog = join(treasuryDir, 'reconciliation.jsonl');
    if (existsSync(reconciliationLog)) {
      try {
        const lines = (await readFile(reconciliationLog, 'utf-8')).trim().split('\n').filter(Boolean);
        if (lines.length > 0) {
          const last = JSON.parse(lines[lines.length - 1]) as { result?: string };
          if (last.result === 'MATCHED' || last.result === 'WITHIN_THRESHOLD') reconciliationStatus = 'matched';
          else if (last.result === 'MISMATCH') reconciliationStatus = 'mismatch';
        }
      } catch { /* skip read errors */ }
    }

    if (fundingState === null && (stablecoinBalance !== null || bankAvailable !== null)) {
      if (runwayDays !== null && runwayDays < 3) fundingState = 'frozen';
      else if (runwayDays !== null && runwayDays < 7) fundingState = 'degraded';
      else fundingState = 'healthy';
    }

    return {
      revenue: totalRevenueCents, spend: totalSpendCents, net, roas, budgetRemaining,
      stablecoinBalance, pendingOfframps,
      bankAvailable, bankReserved,
      runwayDays, fundingState,
      nextTreasuryEvent, unsettledInvoices,
      reconciliationStatus,
    };
  } catch {
    return { ...EMPTY_TREASURY };
  }
}
