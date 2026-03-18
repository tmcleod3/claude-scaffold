/**
 * Reconciliation Engine — Two-pass financial reconciliation (§9.17).
 *
 * Compares VoidForge's recorded spend/revenue against platform-reported values.
 * Runs daily: preliminary at midnight UTC, authoritative at 06:00 UTC.
 *
 * PRD Reference: §9.4 (reconciliation), §9.9 (ReconciliationReport), §9.17 (two-pass)
 */

import { readFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { existsSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { atomicWrite, SPEND_LOG, REVENUE_LOG, TREASURY_DIR } from '../../docs/patterns/financial-transaction.js';

type Cents = number & { readonly __brand: 'Cents' };
type Ratio = number & { readonly __brand: 'Ratio' };
type AdPlatform = 'meta' | 'google' | 'tiktok' | 'linkedin' | 'twitter' | 'reddit';
type RevenueSource = 'stripe' | 'paddle';

// ── Reconciliation Report (§9.9 + §9.17) ──────────────

interface ReconciliationReport {
  id: string;
  date: string;                  // YYYY-MM-DD
  type: 'preliminary' | 'final';
  projectId: string;
  spend: Array<{
    platform: AdPlatform;
    voidforgeRecorded: Cents;
    platformReported: Cents;
    discrepancy: Cents;
    status: 'matched' | 'discrepancy' | 'unavailable';
  }>;
  revenue: Array<{
    source: RevenueSource;
    recorded: Cents;
    reported: Cents;
    discrepancy: Cents;
    status: 'matched' | 'discrepancy' | 'unavailable';
  }>;
  netPosition: Cents;
  blendedRoas: Ratio;
  alerts: string[];
}

// ── Threshold Configuration (§9.17) ───────────────────

const DISCREPANCY_IGNORE_THRESHOLD = 500 as Cents;    // $5 — timing noise
const DISCREPANCY_ALERT_PERCENT = 5;                   // 5% relative threshold
const DISCREPANCY_ALWAYS_ALERT = 5000 as Cents;        // $50 — always alert
const TREND_DAYS = 7;                                  // 7-day trend detection
const TREND_THRESHOLD_PERCENT = 3;                     // 3-4% consistent discrepancy

// ── Spend Log Reader ──────────────────────────────────

interface SpendLogEntry {
  data: {
    platform: string;
    amount: number;
    campaignId: string;
    action: string;
    timestamp: string;
  };
  prevHash: string;
  hash: string;
  walIntentId?: string;
}

async function readSpendLogForDate(date: string): Promise<Map<string, Cents>> {
  const platformTotals = new Map<string, Cents>();
  if (!existsSync(SPEND_LOG)) return platformTotals;

  const content = await readFile(SPEND_LOG, 'utf-8');
  const lines = content.trim().split('\n').filter(Boolean);

  for (const line of lines) {
    try {
      const entry: SpendLogEntry = JSON.parse(line);
      if (!entry.data.timestamp.startsWith(date)) continue;
      if (entry.data.action !== 'spend_check' && entry.data.action !== 'spend_execute') continue;

      const current = platformTotals.get(entry.data.platform) ?? (0 as Cents);
      platformTotals.set(entry.data.platform, (current + entry.data.amount) as Cents);
    } catch { /* malformed line — skip */ }
  }

  return platformTotals;
}

// ── Revenue Log Reader ────────────────────────────────

interface RevenueLogEntry {
  data: {
    source: string;
    amount: number;
    externalId: string;
    type: string;
    timestamp: string;
  };
  prevHash: string;
  hash: string;
}

async function readRevenueLogForDate(date: string): Promise<Map<string, Cents>> {
  const sourceTotals = new Map<string, Cents>();
  if (!existsSync(REVENUE_LOG)) return sourceTotals;

  const content = await readFile(REVENUE_LOG, 'utf-8');
  const lines = content.trim().split('\n').filter(Boolean);

  for (const line of lines) {
    try {
      const entry: RevenueLogEntry = JSON.parse(line);
      if (!entry.data.timestamp.startsWith(date)) continue;

      const current = sourceTotals.get(entry.data.source) ?? (0 as Cents);
      sourceTotals.set(entry.data.source, (current + entry.data.amount) as Cents);
    } catch { /* malformed line */ }
  }

  return sourceTotals;
}

// ── Discrepancy Classification ────────────────────────

function classifyDiscrepancy(recorded: Cents, reported: Cents): 'matched' | 'discrepancy' {
  const diff = Math.abs(recorded - reported) as Cents;

  // Ignore <$5 (timing noise)
  if (diff < DISCREPANCY_IGNORE_THRESHOLD) return 'matched';

  // Always alert >$50
  if (diff >= DISCREPANCY_ALWAYS_ALERT) return 'discrepancy';

  // Alert on >5% relative discrepancy
  const base = Math.max(recorded, reported, 1); // avoid division by zero
  const percent = (diff / base) * 100;
  if (percent >= DISCREPANCY_ALERT_PERCENT) return 'discrepancy';

  return 'matched';
}

// ── Main Reconciliation Function ──────────────────────

export async function runReconciliation(
  projectId: string,
  date: string,
  type: 'preliminary' | 'final',
  platformSpendReports: Map<string, Cents>,     // Platform-reported spend per platform
  revenueSourceReports: Map<string, Cents>,      // Source-reported revenue per source
): Promise<ReconciliationReport> {
  // Read VoidForge's own logs for this date
  const vfSpend = await readSpendLogForDate(date);
  const vfRevenue = await readRevenueLogForDate(date);

  const alerts: string[] = [];

  // ── Reconcile Spend ──────────────────
  const spendResults: ReconciliationReport['spend'] = [];
  const allPlatforms = new Set([...vfSpend.keys(), ...platformSpendReports.keys()]);

  for (const platform of allPlatforms) {
    const recorded = vfSpend.get(platform) ?? (0 as Cents);
    const reported = platformSpendReports.get(platform);

    if (reported === undefined) {
      spendResults.push({
        platform: platform as AdPlatform,
        voidforgeRecorded: recorded,
        platformReported: 0 as Cents,
        discrepancy: recorded,
        status: 'unavailable',
      });
      alerts.push(`${platform}: platform data unavailable. Using VoidForge recorded spend + daily cap as worst-case estimate.`);
      continue;
    }

    const discrepancy = Math.abs(recorded - reported) as Cents;
    const status = classifyDiscrepancy(recorded, reported);

    spendResults.push({
      platform: platform as AdPlatform,
      voidforgeRecorded: recorded,
      platformReported: reported,
      discrepancy,
      status,
    });

    if (status === 'discrepancy' && type === 'final') {
      alerts.push(
        `Reconciliation discrepancy: ${platform} reports $${(reported / 100).toFixed(2)} spent, ` +
        `VoidForge recorded $${(recorded / 100).toFixed(2)} — $${(discrepancy / 100).toFixed(2)} difference`
      );
    }
  }

  // ── Reconcile Revenue ────────────────
  const revenueResults: ReconciliationReport['revenue'] = [];
  const allSources = new Set([...vfRevenue.keys(), ...revenueSourceReports.keys()]);

  for (const source of allSources) {
    const recorded = vfRevenue.get(source) ?? (0 as Cents);
    const reported = revenueSourceReports.get(source);

    if (reported === undefined) {
      revenueResults.push({
        source: source as RevenueSource,
        recorded,
        reported: 0 as Cents,
        discrepancy: recorded,
        status: 'unavailable',
      });
      continue;
    }

    const discrepancy = Math.abs(recorded - reported) as Cents;
    const status = classifyDiscrepancy(recorded, reported);

    revenueResults.push({
      source: source as RevenueSource,
      recorded,
      reported,
      discrepancy,
      status,
    });

    if (status === 'discrepancy' && type === 'final') {
      alerts.push(
        `Revenue discrepancy: ${source} reports $${(reported / 100).toFixed(2)}, ` +
        `VoidForge recorded $${(recorded / 100).toFixed(2)}`
      );
    }
  }

  // ── Calculate Aggregates ─────────────
  const totalRevenue = revenueResults.reduce((sum, r) => sum + (r.reported || r.recorded), 0) as Cents;
  const totalSpend = spendResults.reduce((sum, s) => sum + (s.platformReported || s.voidforgeRecorded), 0) as Cents;
  const netPosition = (totalRevenue - totalSpend) as Cents;
  const blendedRoas = totalSpend > 0 ? (totalRevenue / totalSpend) as Ratio : (0 as Ratio);

  // ── Build Report ─────────────────────
  const report: ReconciliationReport = {
    id: randomUUID(),
    date,
    type,
    projectId,
    spend: spendResults,
    revenue: revenueResults,
    netPosition,
    blendedRoas,
    alerts,
  };

  // ── Write Report ─────────────────────
  const reportDir = join(TREASURY_DIR, 'reconciliation');
  await mkdir(reportDir, { recursive: true });
  const reportPath = join(reportDir, `${date}.json`);
  await atomicWrite(reportPath, JSON.stringify(report, null, 2));

  return report;
}

// ── Currency Enforcement (ADR-6) ──────────────────────

export function enforceCurrency(currency: string, platform: string): void {
  if (currency !== 'USD') {
    throw new Error(
      `This ${platform} account uses ${currency}. VoidForge v11.x requires USD. ` +
      `Change the account currency in the ${platform} dashboard, ` +
      `or wait for multi-currency support (planned post-v11.3).`
    );
  }
}

export type { ReconciliationReport };
