/**
 * Reconciliation tests — spend/revenue log parsing, report generation, discrepancy classification.
 * Tier 1: Financial correctness — wrong totals mean wrong budget decisions.
 */

import { describe, it, expect, afterAll, vi } from 'vitest';
import { createTempHome, cleanupTempHome } from './helpers/temp-dir.js';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

// Create temp dir BEFORE imports that compute paths at module load
const tempDir = await createTempHome();

vi.mock('node:os', async (importOriginal) => {
  const original = await importOriginal<typeof import('node:os')>();
  return { ...original, homedir: () => tempDir };
});

// Import after mock
const { runReconciliation, enforceCurrency } = await import('../lib/reconciliation.js');
const { SPEND_LOG, REVENUE_LOG, TREASURY_DIR } = await import('../lib/financial-core.js');

type Cents = number & { readonly __brand: 'Cents' };
const cents = (n: number) => n as Cents;

afterAll(async () => {
  await cleanupTempHome(tempDir);
});

/**
 * Write fake JSONL log entries for testing.
 * The reconciliation module reads spend-log.jsonl and revenue-log.jsonl from TREASURY_DIR.
 */
async function writeSpendLog(entries: Array<{
  platform: string;
  amount: number;
  action: string;
  timestamp: string;
}>): Promise<void> {
  await mkdir(TREASURY_DIR, { recursive: true });
  const lines = entries.map((e, i) => JSON.stringify({
    data: { platform: e.platform, amount: e.amount, campaignId: `camp-${i}`, action: e.action, timestamp: e.timestamp },
    prevHash: i === 0 ? '0' : `hash-${i - 1}`,
    hash: `hash-${i}`,
  }));
  await writeFile(SPEND_LOG, lines.join('\n') + '\n', 'utf-8');
}

async function writeRevenueLog(entries: Array<{
  source: string;
  amount: number;
  type: string;
  timestamp: string;
}>): Promise<void> {
  await mkdir(TREASURY_DIR, { recursive: true });
  const lines = entries.map((e, i) => JSON.stringify({
    data: { source: e.source, amount: e.amount, externalId: `ext-${i}`, type: e.type, timestamp: e.timestamp },
    prevHash: i === 0 ? '0' : `hash-${i - 1}`,
    hash: `hash-${i}`,
  }));
  await writeFile(REVENUE_LOG, lines.join('\n') + '\n', 'utf-8');
}

describe('reconciliation', () => {
  const testDate = '2026-03-20';

  it('should produce a report with correct spend totals', async () => {
    await writeSpendLog([
      { platform: 'meta', amount: 5000, action: 'spend_execute', timestamp: '2026-03-20T10:00:00Z' },
      { platform: 'meta', amount: 3000, action: 'spend_execute', timestamp: '2026-03-20T14:00:00Z' },
      { platform: 'google', amount: 2000, action: 'spend_check', timestamp: '2026-03-20T12:00:00Z' },
    ]);
    await writeRevenueLog([]);

    const platformSpend = new Map<string, Cents>([
      ['meta', cents(8000)],
      ['google', cents(2000)],
    ]);

    const report = await runReconciliation('proj-1', testDate, 'final', platformSpend, new Map());

    expect(report.projectId).toBe('proj-1');
    expect(report.date).toBe(testDate);
    expect(report.type).toBe('final');

    // VoidForge recorded: meta=8000, google=2000
    const metaSpend = report.spend.find(s => s.platform === 'meta');
    expect(metaSpend).toBeDefined();
    expect(metaSpend!.voidforgeRecorded).toBe(8000);
    expect(metaSpend!.platformReported).toBe(8000);

    const googleSpend = report.spend.find(s => s.platform === 'google');
    expect(googleSpend).toBeDefined();
    expect(googleSpend!.voidforgeRecorded).toBe(2000);
    expect(googleSpend!.platformReported).toBe(2000);
  });

  it('should classify matched when discrepancy is below $5', async () => {
    await writeSpendLog([
      { platform: 'meta', amount: 10000, action: 'spend_execute', timestamp: '2026-03-20T10:00:00Z' },
    ]);
    await writeRevenueLog([]);

    // Platform reports $100.00 (10000 cents), VoidForge recorded $100.00 — within $5
    const platformSpend = new Map<string, Cents>([['meta', cents(10300)]]);
    const report = await runReconciliation('proj-1', testDate, 'final', platformSpend, new Map());

    const metaSpend = report.spend.find(s => s.platform === 'meta');
    expect(metaSpend!.status).toBe('matched');
  });

  it('should classify discrepancy when difference exceeds $50', async () => {
    await writeSpendLog([
      { platform: 'meta', amount: 10000, action: 'spend_execute', timestamp: '2026-03-20T10:00:00Z' },
    ]);
    await writeRevenueLog([]);

    // Platform reports $155 (15500 cents), VoidForge recorded $100 — $55 diff > $50 threshold
    const platformSpend = new Map<string, Cents>([['meta', cents(15500)]]);
    const report = await runReconciliation('proj-1', testDate, 'final', platformSpend, new Map());

    const metaSpend = report.spend.find(s => s.platform === 'meta');
    expect(metaSpend!.status).toBe('discrepancy');
    expect(report.alerts.length).toBeGreaterThan(0);
  });

  it('should mark platform as unavailable when no platform data provided', async () => {
    await writeSpendLog([
      { platform: 'tiktok', amount: 4000, action: 'spend_execute', timestamp: '2026-03-20T10:00:00Z' },
    ]);
    await writeRevenueLog([]);

    // No platform spend data for tiktok
    const report = await runReconciliation('proj-1', testDate, 'final', new Map(), new Map());
    const tiktokSpend = report.spend.find(s => s.platform === 'tiktok');
    expect(tiktokSpend).toBeDefined();
    expect(tiktokSpend!.status).toBe('unavailable');
  });

  it('should reconcile revenue correctly', async () => {
    await writeSpendLog([]);
    await writeRevenueLog([
      { source: 'stripe', amount: 25000, type: 'charge', timestamp: '2026-03-20T08:00:00Z' },
      { source: 'stripe', amount: 15000, type: 'charge', timestamp: '2026-03-20T16:00:00Z' },
    ]);

    const revenueReports = new Map<string, Cents>([['stripe', cents(40000)]]);
    const report = await runReconciliation('proj-1', testDate, 'final', new Map(), revenueReports);

    const stripeRev = report.revenue.find(r => r.source === 'stripe');
    expect(stripeRev).toBeDefined();
    expect(stripeRev!.recorded).toBe(40000);
    expect(stripeRev!.reported).toBe(40000);
    expect(stripeRev!.status).toBe('matched');
  });

  it('should calculate netPosition as revenue minus spend', async () => {
    await writeSpendLog([
      { platform: 'meta', amount: 5000, action: 'spend_execute', timestamp: '2026-03-20T10:00:00Z' },
    ]);
    await writeRevenueLog([
      { source: 'stripe', amount: 20000, type: 'charge', timestamp: '2026-03-20T08:00:00Z' },
    ]);

    const platformSpend = new Map<string, Cents>([['meta', cents(5000)]]);
    const revenueReports = new Map<string, Cents>([['stripe', cents(20000)]]);
    const report = await runReconciliation('proj-1', testDate, 'final', platformSpend, revenueReports);

    // net = revenue (20000) - spend (5000) = 15000
    expect(report.netPosition).toBe(15000);
  });

  it('should calculate blendedRoas as revenue/spend', async () => {
    await writeSpendLog([
      { platform: 'meta', amount: 10000, action: 'spend_execute', timestamp: '2026-03-20T10:00:00Z' },
    ]);
    await writeRevenueLog([
      { source: 'stripe', amount: 30000, type: 'charge', timestamp: '2026-03-20T08:00:00Z' },
    ]);

    const platformSpend = new Map<string, Cents>([['meta', cents(10000)]]);
    const revenueReports = new Map<string, Cents>([['stripe', cents(30000)]]);
    const report = await runReconciliation('proj-1', testDate, 'final', platformSpend, revenueReports);

    // ROAS = 30000 / 10000 = 3.0
    expect(report.blendedRoas).toBe(3);
  });

  it('should filter entries by date (ignoring other dates)', async () => {
    await writeSpendLog([
      { platform: 'meta', amount: 5000, action: 'spend_execute', timestamp: '2026-03-19T10:00:00Z' },
      { platform: 'meta', amount: 3000, action: 'spend_execute', timestamp: '2026-03-20T10:00:00Z' },
      { platform: 'meta', amount: 7000, action: 'spend_execute', timestamp: '2026-03-21T10:00:00Z' },
    ]);
    await writeRevenueLog([]);

    const platformSpend = new Map<string, Cents>([['meta', cents(3000)]]);
    const report = await runReconciliation('proj-1', testDate, 'final', platformSpend, new Map());

    // Only the 2026-03-20 entry (3000) should be counted
    const metaSpend = report.spend.find(s => s.platform === 'meta');
    expect(metaSpend!.voidforgeRecorded).toBe(3000);
  });

  it('should generate a report with a valid UUID id', async () => {
    await writeSpendLog([]);
    await writeRevenueLog([]);

    const report = await runReconciliation('proj-1', testDate, 'preliminary', new Map(), new Map());
    expect(report.id).toBeDefined();
    expect(report.id.length).toBeGreaterThan(10);
  });
});

describe('enforceCurrency', () => {
  it('should not throw for USD', () => {
    expect(() => enforceCurrency('USD', 'meta')).not.toThrow();
  });

  it('should throw for non-USD currencies', () => {
    expect(() => enforceCurrency('EUR', 'meta')).toThrow('requires USD');
  });
});
