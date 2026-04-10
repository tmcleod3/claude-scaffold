/**
 * Treasury heartbeat tests — circuit breakers, socket handlers, state defaults.
 * Tier 1: Pure logic (circuit breakers). Tier 2: Socket route dispatch (mocked deps).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock filesystem and financial-core before importing the module under test.
vi.mock('node:fs', () => ({
  existsSync: vi.fn(() => false),
}));
vi.mock('node:fs/promises', () => ({
  readFile: vi.fn(() => Promise.reject(new Error('ENOENT'))),
  appendFile: vi.fn(() => Promise.resolve()),
  mkdir: vi.fn(() => Promise.resolve()),
  stat: vi.fn(() => Promise.reject(new Error('ENOENT'))),
  rename: vi.fn(() => Promise.resolve()),
}));
vi.mock('../lib/financial-core.js', () => ({
  TREASURY_DIR: '/tmp/test-treasury',
  appendToLog: vi.fn(() => Promise.resolve()),
  atomicWrite: vi.fn(() => Promise.resolve()),
}));
vi.mock('../lib/financial/treasury-planner.js', () => ({
  calculateRunway: vi.fn(() => 30),
  forecastRunway: vi.fn(() => ({ runwayDays: 30, dailySpendCents: 100 })),
  generateFundingPlan: vi.fn(() => null),
  calculateDailySpendRate: vi.fn(() => 0),
}));
vi.mock('../lib/financial/funding-policy.js', () => ({
  evaluatePolicy: vi.fn(() => []),
  aggregateDecisions: vi.fn(() => ({ action: 'allow', blockingRules: [] })),
}));
vi.mock('../lib/financial/funding-auto.js', () => ({
  evaluateAutoFunding: vi.fn(() => null),
}));
vi.mock('../lib/financial/reconciliation-engine.js', () => ({
  reconcileThreeWay: vi.fn(() => ({
    mismatchCount: 0,
    transferMatches: [],
    overallVarianceCents: 0,
  })),
  shouldFreeze: vi.fn(() => false),
}));
vi.mock('../lib/treasury-backup.js', () => ({
  createDailyBackup: vi.fn(() => Promise.resolve({ files: 0, path: '/tmp/backup' })),
}));
vi.mock('../lib/financial/platform-planner.js', () => ({
  planGoogleInvoiceSettlement: vi.fn(() => []),
  planMetaDebitProtection: vi.fn(() => 0),
  generatePortfolioRebalancing: vi.fn(() => []),
}));

import {
  evaluateCircuitBreakers,
  evaluateTransferSlaBreaker,
  evaluateBillingBreakers,
  isStablecoinConfigured,
  getTreasuryStateSnapshot,
  handleTreasuryRequest,
} from '../lib/treasury-heartbeat.js';

import type {
  TreasuryHeartbeatState,
  PendingTransfer,
} from '../lib/treasury-heartbeat.js';

// ── evaluateCircuitBreakers ─────────────────────────────

describe('evaluateCircuitBreakers', () => {
  function makeState(overrides: Partial<TreasuryHeartbeatState> = {}): TreasuryHeartbeatState {
    return {
      stablecoinBalanceCents: 100_000,
      bankBalanceCents: 200_000,
      pendingTransferCount: 0,
      lastOfframpAt: null,
      lastReconciliationAt: null,
      runwayDays: 30,
      fundingFrozen: false,
      freezeReason: null,
      consecutiveMismatches: 0,
      consecutiveProviderFailures: 0,
      lastCircuitBreakerCheck: null,
      dailyMovementCents: 0,
      dailyMovementDate: '2026-01-01',
      pendingObligationsCents: 0,
      googleInvoiceDueSoon: false,
      googleInvoiceCents: 0,
      metaDebitFailed: false,
      metaPaymentRisk: false,
      metaForecast7DayCents: 0,
      ...overrides,
    };
  }

  it('returns no freeze when all counters are zero', () => {
    const result = evaluateCircuitBreakers(makeState());
    expect(result.shouldFreeze).toBe(false);
    expect(result.reasons).toHaveLength(0);
  });

  it('CB-1: freezes after 3 consecutive provider failures', () => {
    const result = evaluateCircuitBreakers(makeState({ consecutiveProviderFailures: 3 }));
    expect(result.shouldFreeze).toBe(true);
    expect(result.reasons[0]).toContain('provider unavailable');
  });

  it('CB-1: does not freeze at 2 consecutive provider failures', () => {
    const result = evaluateCircuitBreakers(makeState({ consecutiveProviderFailures: 2 }));
    expect(result.shouldFreeze).toBe(false);
  });

  it('CB-3: freezes after 2 consecutive reconciliation mismatches', () => {
    const result = evaluateCircuitBreakers(makeState({ consecutiveMismatches: 2 }));
    expect(result.shouldFreeze).toBe(true);
    expect(result.reasons[0]).toContain('mismatch');
  });

  it('CB-3: does not freeze at 1 mismatch', () => {
    const result = evaluateCircuitBreakers(makeState({ consecutiveMismatches: 1 }));
    expect(result.shouldFreeze).toBe(false);
  });

  it('CB-6: freezes when daily movement exceeds $50,000', () => {
    const result = evaluateCircuitBreakers(makeState({ dailyMovementCents: 5_000_001 }));
    expect(result.shouldFreeze).toBe(true);
    expect(result.reasons[0]).toContain('Daily treasury movement');
  });

  it('CB-6: does not freeze at exactly $50,000', () => {
    const result = evaluateCircuitBreakers(makeState({ dailyMovementCents: 5_000_000 }));
    expect(result.shouldFreeze).toBe(false);
  });

  it('returns multiple reasons when multiple breakers fire', () => {
    const result = evaluateCircuitBreakers(makeState({
      consecutiveProviderFailures: 5,
      consecutiveMismatches: 3,
      dailyMovementCents: 10_000_000,
    }));
    expect(result.shouldFreeze).toBe(true);
    expect(result.reasons.length).toBe(3);
  });
});

// ── evaluateTransferSlaBreaker ──────────────────────────

describe('evaluateTransferSlaBreaker', () => {
  function makeTransfer(overrides: Partial<PendingTransfer> = {}): PendingTransfer {
    return {
      id: 'test-transfer',
      fundingPlanId: 'plan-1',
      providerTransferId: 'prov-1',
      amountCents: 10_000,
      status: 'pending',
      initiatedAt: new Date().toISOString(),
      lastPolledAt: new Date().toISOString(),
      ...overrides,
    };
  }

  it('returns no freeze for fresh transfers', () => {
    const result = evaluateTransferSlaBreaker([makeTransfer()]);
    expect(result.shouldFreeze).toBe(false);
  });

  it('freezes for transfers older than SLA', () => {
    const old = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString(); // 25h ago
    const result = evaluateTransferSlaBreaker([makeTransfer({ initiatedAt: old })]);
    expect(result.shouldFreeze).toBe(true);
    expect(result.reasons[0]).toContain('exceeds 24h SLA');
  });

  it('does not freeze completed transfers even if old', () => {
    const old = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
    const result = evaluateTransferSlaBreaker([
      makeTransfer({ status: 'completed', initiatedAt: old }),
    ]);
    expect(result.shouldFreeze).toBe(false);
  });

  it('supports custom SLA hours', () => {
    const sixHoursAgo = new Date(Date.now() - 7 * 60 * 60 * 1000).toISOString();
    const result = evaluateTransferSlaBreaker(
      [makeTransfer({ initiatedAt: sixHoursAgo })],
      6, // 6 hour SLA
    );
    expect(result.shouldFreeze).toBe(true);
  });

  it('handles empty array', () => {
    const result = evaluateTransferSlaBreaker([]);
    expect(result.shouldFreeze).toBe(false);
    expect(result.reasons).toHaveLength(0);
  });
});

// ── evaluateBillingBreakers ─────────────────────────────

describe('evaluateBillingBreakers', () => {
  it('CB-4: freezes when Google invoice due but insufficient fiat', () => {
    const result = evaluateBillingBreakers({
      googleInvoiceDueSoon: true,
      googleInvoiceCents: 100_000,
      bankBalanceCents: 80_000,
      minimumBufferCents: 50_000,
      metaDebitFailed: false,
      metaPaymentRisk: false,
    });
    expect(result.shouldFreeze).toBe(true);
    expect(result.reasons[0]).toContain('Google invoice');
  });

  it('CB-4: does not freeze when sufficient fiat for invoice', () => {
    const result = evaluateBillingBreakers({
      googleInvoiceDueSoon: true,
      googleInvoiceCents: 50_000,
      bankBalanceCents: 200_000,
      minimumBufferCents: 50_000,
      metaDebitFailed: false,
      metaPaymentRisk: false,
    });
    expect(result.shouldFreeze).toBe(false);
  });

  it('CB-5: freezes when Meta debit fails', () => {
    const result = evaluateBillingBreakers({
      googleInvoiceDueSoon: false,
      googleInvoiceCents: 0,
      bankBalanceCents: 200_000,
      minimumBufferCents: 50_000,
      metaDebitFailed: true,
      metaPaymentRisk: false,
    });
    expect(result.shouldFreeze).toBe(true);
    expect(result.reasons[0]).toContain('Meta direct debit failed');
  });

  it('CB-5: freezes when Meta in payment-risk state', () => {
    const result = evaluateBillingBreakers({
      googleInvoiceDueSoon: false,
      googleInvoiceCents: 0,
      bankBalanceCents: 200_000,
      minimumBufferCents: 50_000,
      metaDebitFailed: false,
      metaPaymentRisk: true,
    });
    expect(result.shouldFreeze).toBe(true);
    expect(result.reasons[0]).toContain('payment-risk');
  });

  it('no freeze when all billing is healthy', () => {
    const result = evaluateBillingBreakers({
      googleInvoiceDueSoon: false,
      googleInvoiceCents: 0,
      bankBalanceCents: 200_000,
      minimumBufferCents: 50_000,
      metaDebitFailed: false,
      metaPaymentRisk: false,
    });
    expect(result.shouldFreeze).toBe(false);
    expect(result.reasons).toHaveLength(0);
  });
});

// ── isStablecoinConfigured ──────────────────────────────

describe('isStablecoinConfigured', () => {
  it('returns false when funding config does not exist', () => {
    expect(isStablecoinConfigured()).toBe(false);
  });
});

// ── handleTreasuryRequest ───────────────────────────────

describe('handleTreasuryRequest', () => {
  const logger = { log: vi.fn() };
  const triggerFreeze = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns null for non-treasury routes', async () => {
    const result = await handleTreasuryRequest(
      'GET', '/status', null,
      { vaultVerified: false, totpVerified: false },
      logger, triggerFreeze, null,
    );
    expect(result).toBeNull();
  });

  it('returns 403 for offramp without auth', async () => {
    const result = await handleTreasuryRequest(
      'POST', '/treasury/offramp', null,
      { vaultVerified: false, totpVerified: false },
      logger, triggerFreeze, null,
    );
    expect(result).not.toBeNull();
    expect(result!.status).toBe(403);
  });

  it('returns 400 for offramp when stablecoin not configured', async () => {
    const result = await handleTreasuryRequest(
      'POST', '/treasury/offramp', null,
      { vaultVerified: true, totpVerified: true },
      logger, triggerFreeze, null,
    );
    expect(result).not.toBeNull();
    expect(result!.status).toBe(400);
  });

  it('returns balances on GET /treasury/balances', async () => {
    const result = await handleTreasuryRequest(
      'GET', '/treasury/balances', null,
      { vaultVerified: false, totpVerified: false },
      logger, triggerFreeze, null,
    );
    expect(result).not.toBeNull();
    expect(result!.status).toBe(200);
    const data = (result!.body as { data: Record<string, unknown> }).data;
    expect(data).toHaveProperty('stablecoinBalanceCents');
    expect(data).toHaveProperty('bankBalanceCents');
  });

  it('returns runway on GET /treasury/runway', async () => {
    const result = await handleTreasuryRequest(
      'GET', '/treasury/runway', null,
      { vaultVerified: false, totpVerified: false },
      logger, triggerFreeze, null,
    );
    expect(result).not.toBeNull();
    expect(result!.status).toBe(200);
    const data = (result!.body as { data: Record<string, unknown> }).data;
    expect(data).toHaveProperty('runwayDays');
  });

  it('returns funding status on GET /treasury/funding-status', async () => {
    const result = await handleTreasuryRequest(
      'GET', '/treasury/funding-status', null,
      { vaultVerified: false, totpVerified: false },
      logger, triggerFreeze, null,
    );
    expect(result).not.toBeNull();
    expect(result!.status).toBe(200);
  });

  it('freezes treasury on POST /treasury/freeze', async () => {
    const result = await handleTreasuryRequest(
      'POST', '/treasury/freeze', null,
      { vaultVerified: false, totpVerified: false },
      logger, triggerFreeze, null,
    );
    expect(result).not.toBeNull();
    expect(result!.status).toBe(200);
    expect((result!.body as { message: string }).message).toContain('frozen');
  });

  it('returns 403 for unfreeze without vault+TOTP', async () => {
    const result = await handleTreasuryRequest(
      'POST', '/treasury/unfreeze', null,
      { vaultVerified: false, totpVerified: false },
      logger, triggerFreeze, null,
    );
    expect(result).not.toBeNull();
    expect(result!.status).toBe(403);
  });
});
