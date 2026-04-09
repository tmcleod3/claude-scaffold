/**
 * Funding Policy — the 7 deterministic rules from PRD Section 15.
 *
 * Pure logic — no API calls, no file I/O, fully testable.
 * Each rule evaluates independently and returns an allow/deny/freeze decision.
 * All rules are evaluated on every cycle; the most restrictive decision wins.
 *
 * PRD Reference: §15 (Rules Engine V1)
 * Agents: Dockson (treasury), Heartbeat daemon
 */

import type { Cents, CapabilityState } from '../patterns/funding-plan.js';

// ── Treasury State (input to policy evaluation) ──────

interface TreasuryState {
  /** Current bank available balance in cents */
  bankBalanceCents: Cents;
  /** Minimum operating buffer floor in cents */
  minimumBufferCents: Cents;
  /** Reserved balance (earmarked for pending settlements) */
  reservedCents: Cents;
  /** Proposed off-ramp amount in cents (0 if no off-ramp proposed) */
  proposedOfframpCents: Cents;
  /** Maximum allowed daily treasury movement in cents */
  maxDailyMovementCents: Cents;
  /** Whether a Google invoice is due within the threshold window */
  googleInvoiceDueSoon: boolean;
  /** Google invoice amount in cents (0 if none) */
  googleInvoiceCents: Cents;
  /** Whether Meta uses direct debit billing */
  metaUsesDirectDebit: boolean;
  /** Meta forecasted 7-day spend in cents */
  metaForecast7DayCents: Cents;
  /** Current debit protection buffer in cents */
  debitProtectionBufferCents: Cents;
  /** Whether a reconciliation discrepancy currently exists */
  discrepancyExists: boolean;
  /** Whether a platform budget raise is being proposed */
  proposingBudgetRaise: boolean;
  /** Capability state of the platform being funded */
  platformCapability: CapabilityState;
  /** Whether autonomous funding is being claimed */
  claimingAutonomousFunding: boolean;
}

// ── Policy Decision ──────────────────────────────────

interface PolicyDecision {
  rule: number;
  action: 'allow' | 'deny' | 'freeze';
  reason: string;
}

// ── Policy Thresholds (configurable) ─────────────────

interface PolicyThresholds {
  /** Days before Google invoice due date to start prioritizing */
  googleInvoiceWindowDays: number;
  /** Multiplier for debit protection buffer over forecast */
  debitProtectionMultiplier: number;
}

const DEFAULT_THRESHOLDS: PolicyThresholds = {
  googleInvoiceWindowDays: 7,
  debitProtectionMultiplier: 1.0,
};

// ── Rule Evaluators ──────────────────────────────────

function evaluateRule1(state: TreasuryState): PolicyDecision {
  // Rule 1: Maintain minimum operating buffer
  const balanceAfterReserve = (state.bankBalanceCents - state.reservedCents) as Cents;

  if (balanceAfterReserve < state.minimumBufferCents) {
    return {
      rule: 1,
      action: 'deny',
      reason: `Balance after reserves ($${(balanceAfterReserve / 100).toFixed(2)}) below minimum buffer ($${(state.minimumBufferCents / 100).toFixed(2)}) — deny non-essential spend`,
    };
  }

  return {
    rule: 1,
    action: 'allow',
    reason: `Balance after reserves ($${(balanceAfterReserve / 100).toFixed(2)}) above minimum buffer ($${(state.minimumBufferCents / 100).toFixed(2)})`,
  };
}

function evaluateRule2(state: TreasuryState): PolicyDecision {
  // Rule 2: Never off-ramp more than max daily treasury movement
  if (state.proposedOfframpCents > state.maxDailyMovementCents) {
    return {
      rule: 2,
      action: 'deny',
      reason: `Proposed off-ramp ($${(state.proposedOfframpCents / 100).toFixed(2)}) exceeds max daily movement ($${(state.maxDailyMovementCents / 100).toFixed(2)})`,
    };
  }

  return {
    rule: 2,
    action: 'allow',
    reason: `Proposed off-ramp ($${(state.proposedOfframpCents / 100).toFixed(2)}) within max daily movement ($${(state.maxDailyMovementCents / 100).toFixed(2)})`,
  };
}

function evaluateRule3(state: TreasuryState): PolicyDecision {
  // Rule 3: Never raise platform budget if bank balance after reserve falls below floor
  if (!state.proposingBudgetRaise) {
    return {
      rule: 3,
      action: 'allow',
      reason: 'No budget raise proposed',
    };
  }

  const balanceAfterReserve = (state.bankBalanceCents - state.reservedCents) as Cents;
  if (balanceAfterReserve < state.minimumBufferCents) {
    return {
      rule: 3,
      action: 'deny',
      reason: `Cannot raise platform budget — balance after reserve ($${(balanceAfterReserve / 100).toFixed(2)}) below floor ($${(state.minimumBufferCents / 100).toFixed(2)})`,
    };
  }

  return {
    rule: 3,
    action: 'allow',
    reason: `Budget raise permitted — balance after reserve ($${(balanceAfterReserve / 100).toFixed(2)}) above floor ($${(state.minimumBufferCents / 100).toFixed(2)})`,
  };
}

function evaluateRule4(state: TreasuryState): PolicyDecision {
  // Rule 4: If Google invoice due within threshold, prioritize invoice coverage
  if (!state.googleInvoiceDueSoon) {
    return {
      rule: 4,
      action: 'allow',
      reason: 'No Google invoice due soon',
    };
  }

  const availableForInvoice = (state.bankBalanceCents - state.reservedCents - state.minimumBufferCents) as Cents;
  if (availableForInvoice < state.googleInvoiceCents) {
    return {
      rule: 4,
      action: 'deny',
      reason: `Google invoice ($${(state.googleInvoiceCents / 100).toFixed(2)}) due soon but only $${(availableForInvoice / 100).toFixed(2)} available after reserves and buffer — prioritize invoice coverage over new expansion`,
    };
  }

  return {
    rule: 4,
    action: 'allow',
    reason: `Google invoice ($${(state.googleInvoiceCents / 100).toFixed(2)}) due soon — sufficient funds available ($${(availableForInvoice / 100).toFixed(2)})`,
  };
}

function evaluateRule5(state: TreasuryState): PolicyDecision {
  // Rule 5: If Meta uses direct debit, maintain debit protection buffer above 7-day forecast
  if (!state.metaUsesDirectDebit) {
    return {
      rule: 5,
      action: 'allow',
      reason: 'Meta does not use direct debit',
    };
  }

  if (state.debitProtectionBufferCents < state.metaForecast7DayCents) {
    return {
      rule: 5,
      action: 'deny',
      reason: `Debit protection buffer ($${(state.debitProtectionBufferCents / 100).toFixed(2)}) below Meta 7-day forecast ($${(state.metaForecast7DayCents / 100).toFixed(2)}) — maintain buffer before other operations`,
    };
  }

  return {
    rule: 5,
    action: 'allow',
    reason: `Debit protection buffer ($${(state.debitProtectionBufferCents / 100).toFixed(2)}) above Meta 7-day forecast ($${(state.metaForecast7DayCents / 100).toFixed(2)})`,
  };
}

function evaluateRule6(state: TreasuryState): PolicyDecision {
  // Rule 6: If discrepancy exists, freeze spend increases but allow monitoring
  if (!state.discrepancyExists) {
    return {
      rule: 6,
      action: 'allow',
      reason: 'No reconciliation discrepancy detected',
    };
  }

  return {
    rule: 6,
    action: 'freeze',
    reason: 'Reconciliation discrepancy detected — freeze spend increases, allow read-only monitoring',
  };
}

function evaluateRule7(state: TreasuryState): PolicyDecision {
  // Rule 7: If platform capability is MONITORED_ONLY, never claim autonomous funding
  if (state.platformCapability !== 'MONITORED_ONLY') {
    return {
      rule: 7,
      action: 'allow',
      reason: `Platform capability is ${state.platformCapability} — autonomous funding rules apply normally`,
    };
  }

  if (state.claimingAutonomousFunding) {
    return {
      rule: 7,
      action: 'deny',
      reason: 'Platform capability is MONITORED_ONLY — cannot claim autonomous funding support',
    };
  }

  return {
    rule: 7,
    action: 'allow',
    reason: 'Platform is MONITORED_ONLY but no autonomous funding claimed — monitoring allowed',
  };
}

// ── Main Policy Evaluator ────────────────────────────
// Evaluates all 7 rules and returns all decisions.
// The caller should enforce the most restrictive: freeze > deny > allow.

export function evaluatePolicy(
  state: TreasuryState,
  _thresholds: PolicyThresholds = DEFAULT_THRESHOLDS,
): PolicyDecision[] {
  return [
    evaluateRule1(state),
    evaluateRule2(state),
    evaluateRule3(state),
    evaluateRule4(state),
    evaluateRule5(state),
    evaluateRule6(state),
    evaluateRule7(state),
  ];
}

// ── Decision Aggregator ──────────────────────────────
// Reduces a list of decisions to a single most-restrictive action.

export function aggregateDecisions(
  decisions: PolicyDecision[],
): { action: 'allow' | 'deny' | 'freeze'; blockingRules: PolicyDecision[] } {
  const freezeRules = decisions.filter(d => d.action === 'freeze');
  if (freezeRules.length > 0) {
    return { action: 'freeze', blockingRules: freezeRules };
  }

  const denyRules = decisions.filter(d => d.action === 'deny');
  if (denyRules.length > 0) {
    return { action: 'deny', blockingRules: denyRules };
  }

  return { action: 'allow', blockingRules: [] };
}

export type { TreasuryState, PolicyDecision, PolicyThresholds };
export { DEFAULT_THRESHOLDS };
