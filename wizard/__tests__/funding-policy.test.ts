/**
 * Funding policy tests — 7 deterministic rules from PRD Section 15.
 * Tier 1: Financial core — wrong policy decisions mean wrong spend behavior.
 */

import { describe, it, expect } from 'vitest';
import {
  evaluatePolicy,
  aggregateDecisions,
} from '../lib/financial/funding-policy.js';
import type {
  TreasuryState,
  PolicyDecision,
} from '../lib/financial/funding-policy.js';
import type { Cents, CapabilityState } from '../../docs/patterns/funding-plan.js';
import { toCents } from '../../docs/patterns/funding-plan.js';

// ── Helper: build a default TreasuryState with sensible defaults ──

function makeTreasuryState(overrides: Partial<TreasuryState> = {}): TreasuryState {
  return {
    bankBalanceCents: toCents(50_000) as Cents,
    minimumBufferCents: toCents(10_000) as Cents,
    reservedCents: 0 as Cents,
    proposedOfframpCents: 0 as Cents,
    maxDailyMovementCents: toCents(50_000) as Cents,
    googleInvoiceDueSoon: false,
    googleInvoiceCents: 0 as Cents,
    metaUsesDirectDebit: false,
    metaForecast7DayCents: 0 as Cents,
    debitProtectionBufferCents: 0 as Cents,
    discrepancyExists: false,
    proposingBudgetRaise: false,
    platformCapability: 'FULLY_FUNDABLE' as CapabilityState,
    claimingAutonomousFunding: false,
    ...overrides,
  };
}

// ── Rule 1: Maintain minimum operating buffer ────────

describe('Rule 1 — maintain buffer', () => {
  it('should deny when balance after reserves is below minimum buffer', () => {
    const state = makeTreasuryState({
      bankBalanceCents: toCents(8_000) as Cents,
      reservedCents: toCents(2_000) as Cents,
      minimumBufferCents: toCents(10_000) as Cents,
    });
    // Balance after reserve: $6,000 < $10,000 minimum
    const decisions = evaluatePolicy(state);
    const rule1 = decisions.find(d => d.rule === 1)!;
    expect(rule1.action).toBe('deny');
    expect(rule1.reason).toContain('below minimum buffer');
  });

  it('should allow when balance after reserves is above minimum buffer', () => {
    const state = makeTreasuryState({
      bankBalanceCents: toCents(25_000) as Cents,
      reservedCents: toCents(5_000) as Cents,
      minimumBufferCents: toCents(10_000) as Cents,
    });
    // Balance after reserve: $20,000 > $10,000 minimum
    const decisions = evaluatePolicy(state);
    const rule1 = decisions.find(d => d.rule === 1)!;
    expect(rule1.action).toBe('allow');
    expect(rule1.reason).toContain('above minimum buffer');
  });
});

// ── Rule 2: Daily cap on off-ramp ───────────────────

describe('Rule 2 — daily cap', () => {
  it('should deny when proposed off-ramp exceeds daily maximum', () => {
    const state = makeTreasuryState({
      proposedOfframpCents: toCents(60_000) as Cents,
      maxDailyMovementCents: toCents(50_000) as Cents,
    });
    const decisions = evaluatePolicy(state);
    const rule2 = decisions.find(d => d.rule === 2)!;
    expect(rule2.action).toBe('deny');
    expect(rule2.reason).toContain('exceeds max daily movement');
  });

  it('should allow when proposed off-ramp is within daily maximum', () => {
    const state = makeTreasuryState({
      proposedOfframpCents: toCents(30_000) as Cents,
      maxDailyMovementCents: toCents(50_000) as Cents,
    });
    const decisions = evaluatePolicy(state);
    const rule2 = decisions.find(d => d.rule === 2)!;
    expect(rule2.action).toBe('allow');
    expect(rule2.reason).toContain('within max daily movement');
  });
});

// ── Rule 3: No budget raise when balance is low ─────

describe('Rule 3 — no budget raise when low', () => {
  it('should deny budget raise when balance after reserve falls below floor', () => {
    const state = makeTreasuryState({
      proposingBudgetRaise: true,
      bankBalanceCents: toCents(12_000) as Cents,
      reservedCents: toCents(5_000) as Cents,
      minimumBufferCents: toCents(10_000) as Cents,
    });
    // Balance after reserve: $7,000 < $10,000 floor
    const decisions = evaluatePolicy(state);
    const rule3 = decisions.find(d => d.rule === 3)!;
    expect(rule3.action).toBe('deny');
    expect(rule3.reason).toContain('Cannot raise platform budget');
  });

  it('should allow when no budget raise is proposed', () => {
    const state = makeTreasuryState({ proposingBudgetRaise: false });
    const decisions = evaluatePolicy(state);
    const rule3 = decisions.find(d => d.rule === 3)!;
    expect(rule3.action).toBe('allow');
    expect(rule3.reason).toContain('No budget raise proposed');
  });

  it('should allow budget raise when balance is above floor', () => {
    const state = makeTreasuryState({
      proposingBudgetRaise: true,
      bankBalanceCents: toCents(30_000) as Cents,
      reservedCents: toCents(5_000) as Cents,
      minimumBufferCents: toCents(10_000) as Cents,
    });
    // Balance after reserve: $25,000 > $10,000 floor
    const decisions = evaluatePolicy(state);
    const rule3 = decisions.find(d => d.rule === 3)!;
    expect(rule3.action).toBe('allow');
    expect(rule3.reason).toContain('Budget raise permitted');
  });
});

// ── Rule 4: Invoice priority ────────────────────────

describe('Rule 4 — invoice priority', () => {
  it('should deny when Google invoice due soon and insufficient funds', () => {
    const state = makeTreasuryState({
      googleInvoiceDueSoon: true,
      googleInvoiceCents: toCents(20_000) as Cents,
      bankBalanceCents: toCents(25_000) as Cents,
      reservedCents: toCents(5_000) as Cents,
      minimumBufferCents: toCents(10_000) as Cents,
    });
    // Available: $25k - $5k - $10k = $10k < $20k invoice
    const decisions = evaluatePolicy(state);
    const rule4 = decisions.find(d => d.rule === 4)!;
    expect(rule4.action).toBe('deny');
    expect(rule4.reason).toContain('Google invoice');
    expect(rule4.reason).toContain('prioritize invoice coverage');
  });

  it('should allow when no Google invoice is due soon', () => {
    const state = makeTreasuryState({ googleInvoiceDueSoon: false });
    const decisions = evaluatePolicy(state);
    const rule4 = decisions.find(d => d.rule === 4)!;
    expect(rule4.action).toBe('allow');
    expect(rule4.reason).toContain('No Google invoice due soon');
  });

  it('should allow when funds are sufficient to cover invoice', () => {
    const state = makeTreasuryState({
      googleInvoiceDueSoon: true,
      googleInvoiceCents: toCents(5_000) as Cents,
      bankBalanceCents: toCents(50_000) as Cents,
      reservedCents: toCents(5_000) as Cents,
      minimumBufferCents: toCents(10_000) as Cents,
    });
    // Available: $50k - $5k - $10k = $35k > $5k invoice
    const decisions = evaluatePolicy(state);
    const rule4 = decisions.find(d => d.rule === 4)!;
    expect(rule4.action).toBe('allow');
    expect(rule4.reason).toContain('sufficient funds available');
  });
});

// ── Rule 5: Meta debit protection ───────────────────

describe('Rule 5 — Meta debit protection', () => {
  it('should deny when debit buffer is below 7-day forecast', () => {
    const state = makeTreasuryState({
      metaUsesDirectDebit: true,
      metaForecast7DayCents: toCents(15_000) as Cents,
      debitProtectionBufferCents: toCents(10_000) as Cents,
    });
    const decisions = evaluatePolicy(state);
    const rule5 = decisions.find(d => d.rule === 5)!;
    expect(rule5.action).toBe('deny');
    expect(rule5.reason).toContain('below Meta 7-day forecast');
  });

  it('should allow when Meta does not use direct debit', () => {
    const state = makeTreasuryState({ metaUsesDirectDebit: false });
    const decisions = evaluatePolicy(state);
    const rule5 = decisions.find(d => d.rule === 5)!;
    expect(rule5.action).toBe('allow');
    expect(rule5.reason).toContain('Meta does not use direct debit');
  });

  it('should allow when debit buffer is sufficient', () => {
    const state = makeTreasuryState({
      metaUsesDirectDebit: true,
      metaForecast7DayCents: toCents(10_000) as Cents,
      debitProtectionBufferCents: toCents(15_000) as Cents,
    });
    const decisions = evaluatePolicy(state);
    const rule5 = decisions.find(d => d.rule === 5)!;
    expect(rule5.action).toBe('allow');
    expect(rule5.reason).toContain('above Meta 7-day forecast');
  });
});

// ── Rule 6: Reconciliation discrepancy ──────────────

describe('Rule 6 — reconciliation discrepancy', () => {
  it('should freeze when a reconciliation mismatch exists', () => {
    const state = makeTreasuryState({ discrepancyExists: true });
    const decisions = evaluatePolicy(state);
    const rule6 = decisions.find(d => d.rule === 6)!;
    expect(rule6.action).toBe('freeze');
    expect(rule6.reason).toContain('Reconciliation discrepancy detected');
  });

  it('should allow when no discrepancy exists', () => {
    const state = makeTreasuryState({ discrepancyExists: false });
    const decisions = evaluatePolicy(state);
    const rule6 = decisions.find(d => d.rule === 6)!;
    expect(rule6.action).toBe('allow');
    expect(rule6.reason).toContain('No reconciliation discrepancy');
  });
});

// ── Rule 7: MONITORED_ONLY autonomous funding ───────

describe('Rule 7 — MONITORED_ONLY', () => {
  it('should deny autonomous funding for MONITORED_ONLY platforms', () => {
    const state = makeTreasuryState({
      platformCapability: 'MONITORED_ONLY' as CapabilityState,
      claimingAutonomousFunding: true,
    });
    const decisions = evaluatePolicy(state);
    const rule7 = decisions.find(d => d.rule === 7)!;
    expect(rule7.action).toBe('deny');
    expect(rule7.reason).toContain('cannot claim autonomous funding');
  });

  it('should allow monitoring for MONITORED_ONLY when not claiming autonomous funding', () => {
    const state = makeTreasuryState({
      platformCapability: 'MONITORED_ONLY' as CapabilityState,
      claimingAutonomousFunding: false,
    });
    const decisions = evaluatePolicy(state);
    const rule7 = decisions.find(d => d.rule === 7)!;
    expect(rule7.action).toBe('allow');
    expect(rule7.reason).toContain('monitoring allowed');
  });

  it('should allow autonomous funding for FULLY_FUNDABLE platforms', () => {
    const state = makeTreasuryState({
      platformCapability: 'FULLY_FUNDABLE' as CapabilityState,
      claimingAutonomousFunding: true,
    });
    const decisions = evaluatePolicy(state);
    const rule7 = decisions.find(d => d.rule === 7)!;
    expect(rule7.action).toBe('allow');
    expect(rule7.reason).toContain('FULLY_FUNDABLE');
  });
});

// ── aggregateDecisions: most restrictive wins ───────

describe('aggregateDecisions', () => {
  it('should return freeze when any rule freezes (freeze > deny > allow)', () => {
    const decisions: PolicyDecision[] = [
      { rule: 1, action: 'allow', reason: 'ok' },
      { rule: 2, action: 'deny', reason: 'too much' },
      { rule: 6, action: 'freeze', reason: 'discrepancy' },
    ];
    const result = aggregateDecisions(decisions);
    expect(result.action).toBe('freeze');
    expect(result.blockingRules).toHaveLength(1);
    expect(result.blockingRules[0].rule).toBe(6);
  });

  it('should return deny when no freeze but at least one deny', () => {
    const decisions: PolicyDecision[] = [
      { rule: 1, action: 'allow', reason: 'ok' },
      { rule: 2, action: 'deny', reason: 'too much' },
      { rule: 3, action: 'deny', reason: 'low balance' },
      { rule: 4, action: 'allow', reason: 'ok' },
    ];
    const result = aggregateDecisions(decisions);
    expect(result.action).toBe('deny');
    expect(result.blockingRules).toHaveLength(2);
  });

  it('should return allow with empty blockingRules when all rules allow', () => {
    const decisions: PolicyDecision[] = [
      { rule: 1, action: 'allow', reason: 'ok' },
      { rule: 2, action: 'allow', reason: 'ok' },
      { rule: 3, action: 'allow', reason: 'ok' },
    ];
    const result = aggregateDecisions(decisions);
    expect(result.action).toBe('allow');
    expect(result.blockingRules).toHaveLength(0);
  });

  it('should return allow for empty decision list', () => {
    const result = aggregateDecisions([]);
    expect(result.action).toBe('allow');
    expect(result.blockingRules).toHaveLength(0);
  });
});
