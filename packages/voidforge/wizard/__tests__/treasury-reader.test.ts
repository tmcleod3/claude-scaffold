/**
 * Treasury reader tests — summary reading from cached file and JSONL fallback.
 * Tier 1: Pure logic (JSONL parsing). Tier 2: Mocked filesystem reads.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock filesystem
const mockExistsSync = vi.fn(() => false);
vi.mock('node:fs', () => ({
  existsSync: (...args: unknown[]) => mockExistsSync(...args),
}));

const mockReadFile = vi.fn(() => Promise.reject(new Error('ENOENT')));
const mockReaddir = vi.fn(() => Promise.resolve([] as string[]));
vi.mock('node:fs/promises', () => ({
  readFile: (...args: unknown[]) => mockReadFile(...args),
  readdir: (...args: unknown[]) => mockReaddir(...args),
}));

vi.mock('../lib/http-helpers.js', () => ({
  readFileOrNull: vi.fn(() => Promise.resolve(null)),
}));

import {
  readTreasurySummary,
  readTreasurySummaryFromLogs,
  TREASURY_SUMMARY_FILE,
} from '../lib/treasury-reader.js';

beforeEach(() => {
  vi.clearAllMocks();
  mockExistsSync.mockReturnValue(false);
  mockReadFile.mockRejectedValue(new Error('ENOENT'));
});

describe('TREASURY_SUMMARY_FILE', () => {
  it('is named treasury-summary.json', () => {
    expect(TREASURY_SUMMARY_FILE).toBe('treasury-summary.json');
  });
});

describe('readTreasurySummary', () => {
  it('returns empty treasury when no files exist', async () => {
    const result = await readTreasurySummary('/nonexistent');
    expect(result.revenue).toBe(0);
    expect(result.spend).toBe(0);
    expect(result.net).toBe(0);
    expect(result.roas).toBe(0);
  });

  it('reads cached summary when file exists and is valid', async () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFile.mockResolvedValue(JSON.stringify({
      revenue: 50000,
      spend: 20000,
      net: 30000,
      roas: 2.5,
      budgetRemaining: 80000,
    }));
    const result = await readTreasurySummary('/treasury-dir');
    expect(result.revenue).toBe(50000);
    expect(result.spend).toBe(20000);
    expect(result.net).toBe(30000);
    expect(result.roas).toBe(2.5);
  });
});

describe('readTreasurySummaryFromLogs', () => {
  it('returns empty summary when no log files exist', async () => {
    const result = await readTreasurySummaryFromLogs('/nonexistent');
    expect(result.revenue).toBe(0);
    expect(result.spend).toBe(0);
    expect(result.net).toBe(0);
  });

  it('sums spend entries from JSONL', async () => {
    mockExistsSync.mockImplementation((path: string) => {
      if (typeof path === 'string' && path.includes('spend-log.jsonl')) return true;
      return false;
    });
    mockReadFile.mockResolvedValue(
      '{"amountCents":1000}\n{"amountCents":2000}\n{"amountCents":500}\n',
    );
    const result = await readTreasurySummaryFromLogs('/treasury');
    expect(result.spend).toBe(3500);
  });

  it('derives funding state from runway days', async () => {
    mockExistsSync.mockImplementation((path: string) => {
      if (typeof path === 'string' && path.includes('funding-config.json.enc')) return true;
      return false;
    });
    const heartbeatData = {
      stablecoinBalanceCents: 100000,
      bankAvailableCents: 50000,
      runwayDays: 2,
    };
    const result = await readTreasurySummaryFromLogs('/treasury', heartbeatData);
    expect(result.fundingState).toBe('frozen');
  });

  it('sets fundingState to degraded when runway < 7 days', async () => {
    mockExistsSync.mockImplementation((path: string) => {
      if (typeof path === 'string' && path.includes('funding-config.json.enc')) return true;
      return false;
    });
    const heartbeatData = {
      stablecoinBalanceCents: 100000,
      bankAvailableCents: 50000,
      runwayDays: 5,
    };
    const result = await readTreasurySummaryFromLogs('/treasury', heartbeatData);
    expect(result.fundingState).toBe('degraded');
  });

  it('sets fundingState to healthy when runway >= 7 days', async () => {
    mockExistsSync.mockImplementation((path: string) => {
      if (typeof path === 'string' && path.includes('funding-config.json.enc')) return true;
      return false;
    });
    const heartbeatData = {
      stablecoinBalanceCents: 100000,
      bankAvailableCents: 50000,
      runwayDays: 10,
    };
    const result = await readTreasurySummaryFromLogs('/treasury', heartbeatData);
    expect(result.fundingState).toBe('healthy');
  });

  it('counts unsettled invoices from funding plans', async () => {
    mockExistsSync.mockImplementation((path: string) => {
      if (typeof path === 'string' && path.includes('funding-plans.jsonl')) return true;
      return false;
    });
    mockReadFile.mockResolvedValue(
      '{"status":"PENDING_SETTLEMENT"}\n{"status":"APPROVED"}\n{"status":"SETTLED"}\n',
    );
    const result = await readTreasurySummaryFromLogs('/treasury');
    expect(result.unsettledInvoices).toBe(2);
  });

  it('reads reconciliation status from last entry', async () => {
    mockExistsSync.mockImplementation((path: string) => {
      if (typeof path === 'string' && path.includes('reconciliation.jsonl')) return true;
      return false;
    });
    mockReadFile.mockResolvedValue('{"result":"MATCHED"}\n');
    const result = await readTreasurySummaryFromLogs('/treasury');
    expect(result.reconciliationStatus).toBe('matched');
  });
});
