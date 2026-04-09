/**
 * Treasury planner tests — pure logic module for runway forecasting and plan generation.
 * Tier 1: Financial core — all deterministic, no mocks needed.
 */

import { describe, it, expect } from 'vitest';
import {
  calculateRunway,
  shouldTriggerOfframp,
  calculateRequiredOfframp,
  generateFundingPlan,
  forecastSpend,
  calculateDailySpendRate,
  forecastRunway,
} from '../lib/financial/treasury-planner.js';
import type {
  CampaignSpendProjection,
  FundingPlanConfig,
  ObligationInput,
} from '../lib/financial/treasury-planner.js';
import type { Cents, StablecoinFundingSource, OperatingBankAccount } from '../../../../docs/patterns/funding-plan.js';
import { toCents } from '../../../../docs/patterns/funding-plan.js';

// ── calculateRunway ──────────────────────────────────

describe('calculateRunway', () => {
  it('should return correct days when balance and spend are positive', () => {
    const result = calculateRunway(toCents(10_000) as Cents, toCents(1_000) as Cents);
    expect(result).toBe(10);
  });

  it('should return 0 when balance is less than one day of spend', () => {
    const result = calculateRunway(toCents(500) as Cents, toCents(1_000) as Cents);
    expect(result).toBe(0);
  });

  it('should return Infinity when daily spend rate is zero', () => {
    const result = calculateRunway(toCents(10_000) as Cents, 0 as Cents);
    expect(result).toBe(Infinity);
  });

  it('should return Infinity when daily spend rate is negative', () => {
    const result = calculateRunway(toCents(10_000) as Cents, -100 as Cents);
    expect(result).toBe(Infinity);
  });

  it('should floor partial days', () => {
    // 15000 / 2000 = 7.5 -> floor to 7
    const result = calculateRunway(toCents(150) as Cents, toCents(20) as Cents);
    expect(result).toBe(7);
  });
});

// ── shouldTriggerOfframp ─────────────────────────────

describe('shouldTriggerOfframp', () => {
  it('should return true when effective balance is below threshold', () => {
    const result = shouldTriggerOfframp(
      toCents(5_000) as Cents,  // bank balance
      toCents(10_000) as Cents, // threshold
      toCents(2_000) as Cents,  // pending spend
    );
    expect(result.shouldOfframp).toBe(true);
    expect(result.amountCents).toBeGreaterThan(0);
  });

  it('should return false when effective balance is above threshold', () => {
    const result = shouldTriggerOfframp(
      toCents(20_000) as Cents, // bank balance
      toCents(10_000) as Cents, // threshold
      toCents(2_000) as Cents,  // pending spend
    );
    expect(result.shouldOfframp).toBe(false);
    expect(result.amountCents).toBe(0);
  });

  it('should account for pending spend in effective balance', () => {
    // Balance $15,000 - pending $6,000 = effective $9,000 < threshold $10,000
    const result = shouldTriggerOfframp(
      toCents(15_000) as Cents,
      toCents(10_000) as Cents,
      toCents(6_000) as Cents,
    );
    expect(result.shouldOfframp).toBe(true);
  });

  it('should return deficit amount as amountCents', () => {
    // Balance $5,000 - pending $1,000 = effective $4,000; threshold $10,000; deficit $6,000
    const result = shouldTriggerOfframp(
      toCents(5_000) as Cents,
      toCents(10_000) as Cents,
      toCents(1_000) as Cents,
    );
    expect(result.shouldOfframp).toBe(true);
    expect(result.amountCents).toBe(toCents(6_000));
  });
});

// ── calculateRequiredOfframp ─────────────────────────

describe('calculateRequiredOfframp', () => {
  it('should return correct amount with fee buffer', () => {
    // Need: buffer $10,000 + obligations $5,000 + fees $10 - balance $8,000 = $7,010
    const result = calculateRequiredOfframp(
      toCents(8_000) as Cents,  // bank balance
      toCents(10_000) as Cents, // buffer target
      toCents(5_000) as Cents,  // pending obligations
      toCents(10) as Cents,     // fee estimate
    );
    expect(result).toBe(toCents(7_010));
  });

  it('should return 0 when balance exceeds all needs', () => {
    const result = calculateRequiredOfframp(
      toCents(50_000) as Cents,
      toCents(10_000) as Cents,
      toCents(5_000) as Cents,
      toCents(10) as Cents,
    );
    expect(result).toBe(0);
  });

  it('should include fee estimate in required amount', () => {
    // Need: buffer $10,000 + obligations $0 + fees $25 - balance $9,990 = $35
    const result = calculateRequiredOfframp(
      toCents(9_990) as Cents,
      toCents(10_000) as Cents,
      0 as Cents,
      toCents(25) as Cents,
    );
    expect(result).toBe(toCents(35));
  });
});

// ── generateFundingPlan ──────────────────────────────

describe('generateFundingPlan', () => {
  const source: StablecoinFundingSource = {
    id: 'src-001',
    provider: 'circle',
    asset: 'USDC',
    network: 'ETH',
    sourceAccountId: 'wallet-abc',
    whitelistedDestinationBankId: 'bank-001',
    status: 'active',
  };

  const bank: OperatingBankAccount = {
    id: 'bank-001',
    provider: 'mercury',
    accountId: 'merc-abc',
    currency: 'USD',
    availableBalanceCents: toCents(2_000) as Cents,
    reservedBalanceCents: 0 as Cents,
    minimumBufferCents: toCents(5_000) as Cents,
  };

  const config: FundingPlanConfig = {
    minimumOfframpCents: toCents(100) as Cents,
    bufferTargetCents: toCents(10_000) as Cents,
    maxDailyOfframpCents: toCents(50_000) as Cents,
    targetRunwayDays: 30,
  };

  it('should return a valid plan when funding is needed', () => {
    const obligations: ObligationInput[] = [
      { id: 'ob-1', platform: 'google', type: 'invoice', amountCents: toCents(3_000) as Cents, dueDate: '2026-04-01', overdue: false },
    ];

    const plan = generateFundingPlan(source, bank, obligations, config, 'prev-hash-001');
    expect(plan).not.toBeNull();
    expect(plan!.requiredCents).toBeGreaterThan(0);
    expect(plan!.reason).toBeDefined();
    expect(plan!.sourceFundingId).toBe('src-001');
    expect(plan!.destinationBankId).toBe('bank-001');
    expect(plan!.hash).toBeDefined();
    expect(plan!.hash.length).toBe(64); // SHA-256 hex
  });

  it('should return null when no funding is needed', () => {
    const richBank: OperatingBankAccount = {
      ...bank,
      availableBalanceCents: toCents(100_000) as Cents,
      minimumBufferCents: toCents(5_000) as Cents,
    };
    const plan = generateFundingPlan(source, richBank, [], config, 'prev-hash-002');
    expect(plan).toBeNull();
  });

  it('should round up to minimum offramp when required is below minimum', () => {
    const almostEnoughBank: OperatingBankAccount = {
      ...bank,
      availableBalanceCents: toCents(9_950) as Cents, // need just $60 (buffer $10k + fee $10 - balance)
    };
    const plan = generateFundingPlan(source, almostEnoughBank, [], config, 'prev-hash-003');
    expect(plan).not.toBeNull();
    // Required is $60 but minimum is $100 — should round up to minimum
    expect(plan!.requiredCents).toBe(toCents(100));
  });

  it('should set reason to INVOICE_DUE when overdue obligations exist', () => {
    const overdueObligations: ObligationInput[] = [
      { id: 'ob-2', platform: 'google', type: 'invoice', amountCents: toCents(1_000) as Cents, dueDate: '2026-03-01', overdue: true },
    ];
    const plan = generateFundingPlan(source, bank, overdueObligations, config, 'prev-hash-004');
    expect(plan).not.toBeNull();
    expect(plan!.reason).toBe('INVOICE_DUE');
  });
});

// ── forecastSpend ────────────────────────────────────

describe('forecastSpend', () => {
  it('should sum active campaign budgets over N days', () => {
    const campaigns: CampaignSpendProjection[] = [
      { campaignId: 'c1', platform: 'google', dailyBudgetCents: toCents(100) as Cents, status: 'active' },
      { campaignId: 'c2', platform: 'meta', dailyBudgetCents: toCents(50) as Cents, status: 'active' },
    ];
    expect(forecastSpend(campaigns, 10)).toBe(toCents(1_500));
  });

  it('should ignore paused campaigns', () => {
    const campaigns: CampaignSpendProjection[] = [
      { campaignId: 'c1', platform: 'google', dailyBudgetCents: toCents(100) as Cents, status: 'active' },
      { campaignId: 'c2', platform: 'meta', dailyBudgetCents: toCents(50) as Cents, status: 'paused' },
    ];
    expect(forecastSpend(campaigns, 10)).toBe(toCents(1_000));
  });

  it('should return 0 for 0 days', () => {
    const campaigns: CampaignSpendProjection[] = [
      { campaignId: 'c1', platform: 'google', dailyBudgetCents: toCents(100) as Cents, status: 'active' },
    ];
    expect(forecastSpend(campaigns, 0)).toBe(0);
  });
});

// ── forecastRunway ───────────────────────────────────

describe('forecastRunway', () => {
  it('should compute runway from balance, campaigns, and obligations', () => {
    const campaigns: CampaignSpendProjection[] = [
      { campaignId: 'c1', platform: 'google', dailyBudgetCents: toCents(100) as Cents, status: 'active' },
    ];
    const result = forecastRunway(toCents(10_000) as Cents, campaigns, toCents(2_000) as Cents);
    // Effective balance: $10,000 - $2,000 = $8,000. Daily spend: $100. Runway: 80 days
    expect(result.runwayDays).toBe(80);
    expect(result.dailySpendCents).toBe(toCents(100));
    expect(result.effectiveBalanceCents).toBe(toCents(8_000));
  });
});
