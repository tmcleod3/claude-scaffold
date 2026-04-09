/**
 * Auto-Funding Module — bridges treasury-planner and funding-policy
 * for the heartbeat daemon's runway-forecast job.
 *
 * Pure logic — no API calls, no file I/O, fully testable.
 * Called by the heartbeat's `runway-forecast` job every 6 hours.
 * If both the planner says "off-ramp needed" and the policy says "allow",
 * generates a FundingPlan for the daemon to execute.
 *
 * PRD Reference: §15 (Rules Engine), §12.4 (FundingPlan)
 * Agents: Dockson (treasury), Heartbeat daemon
 */

import type { Cents, FundingPlan, StablecoinFundingSource, OperatingBankAccount } from '../../../../../docs/patterns/funding-plan.js';

import { shouldTriggerOfframp, generateFundingPlan } from './treasury-planner.js';
import type { FundingPlanConfig, ObligationInput } from './treasury-planner.js';

import { evaluatePolicy, aggregateDecisions } from './funding-policy.js';
import type { TreasuryState, PolicyDecision } from './funding-policy.js';

// ── Auto-Funding Config ──────────────────────────────

interface AutoFundingConfig {
  source: StablecoinFundingSource;
  bank: OperatingBankAccount;
  planConfig: FundingPlanConfig;
  /** Current pending spend across all platforms */
  pendingSpendCents: Cents;
  /** Current obligations (invoices, debits, buffer needs) */
  obligations: ObligationInput[];
  /** Whether a Google invoice is due within the threshold window */
  googleInvoiceDueSoon: boolean;
  /** Google invoice amount in cents */
  googleInvoiceCents: Cents;
  /** Whether Meta uses direct debit billing */
  metaUsesDirectDebit: boolean;
  /** Meta forecasted 7-day spend in cents */
  metaForecast7DayCents: Cents;
  /** Current debit protection buffer in cents */
  debitProtectionBufferCents: Cents;
  /** Whether a reconciliation discrepancy currently exists */
  discrepancyExists: boolean;
  /** Previous hash for chain continuity */
  previousHash: string;
}

// ── Auto-Funding Result ──────────────────────────────

interface AutoFundingResult {
  plan: FundingPlan;
  policyDecisions: PolicyDecision[];
}

// ── Evaluate Auto-Funding ────────────────────────────
// Returns a FundingPlan if both planner and policy approve, null otherwise.

export function evaluateAutoFunding(
  config: AutoFundingConfig,
): AutoFundingResult | null {
  // Step 1: Ask the planner if an off-ramp is even needed
  const offrampCheck = shouldTriggerOfframp(
    config.bank.availableBalanceCents,
    config.planConfig.bufferTargetCents,
    config.pendingSpendCents,
  );

  if (!offrampCheck.shouldOfframp) {
    return null;
  }

  // Step 2: Generate a candidate funding plan
  const plan = generateFundingPlan(
    config.source,
    config.bank,
    config.obligations,
    config.planConfig,
    config.previousHash,
  );

  if (!plan) {
    return null;
  }

  // Step 3: Evaluate policy against all 7 rules
  const policyState: TreasuryState = {
    bankBalanceCents: config.bank.availableBalanceCents,
    minimumBufferCents: config.bank.minimumBufferCents,
    reservedCents: config.bank.reservedBalanceCents,
    proposedOfframpCents: plan.requiredCents,
    maxDailyMovementCents: config.planConfig.maxDailyOfframpCents,
    googleInvoiceDueSoon: config.googleInvoiceDueSoon,
    googleInvoiceCents: config.googleInvoiceCents,
    metaUsesDirectDebit: config.metaUsesDirectDebit,
    metaForecast7DayCents: config.metaForecast7DayCents,
    debitProtectionBufferCents: config.debitProtectionBufferCents,
    discrepancyExists: config.discrepancyExists,
    proposingBudgetRaise: false, // auto-funding never raises budgets
    platformCapability: 'FULLY_FUNDABLE', // auto-funding targets funded platforms
    claimingAutonomousFunding: true, // this IS autonomous funding
  };

  const decisions = evaluatePolicy(policyState);
  const aggregate = aggregateDecisions(decisions);

  // Step 4: Block if any rule denies or freezes
  if (aggregate.action === 'deny' || aggregate.action === 'freeze') {
    return null;
  }

  return { plan, policyDecisions: decisions };
}

export type { AutoFundingConfig, AutoFundingResult };
