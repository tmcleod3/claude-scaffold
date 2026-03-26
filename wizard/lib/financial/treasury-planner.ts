/**
 * Treasury Planner — pure logic module for runway forecasting and plan generation.
 *
 * No API calls, no file I/O — fully testable deterministic functions.
 * All monetary values use branded integer cents (Cents type).
 *
 * PRD Reference: §12.4 (FundingPlan), §12.5 (TransferRecord), §15 (Rules Engine)
 * Agents: Dockson (treasury), Heartbeat daemon
 */

import type {
  Cents, FundingPlan, FundingPlanReason, TargetPlatform,
  OperatingBankAccount, StablecoinFundingSource,
  PendingObligation,
} from '../../../docs/patterns/funding-plan.js';
import {
  toCents, createFundingPlan, prioritizeObligations,
} from '../../../docs/patterns/funding-plan.js';

// ── Campaign Spend Projection ────────────────────────

interface CampaignSpendProjection {
  campaignId: string;
  platform: 'google' | 'meta';
  dailyBudgetCents: Cents;
  status: 'active' | 'paused';
}

// ── Funding Plan Generation Config ───────────────────

interface FundingPlanConfig {
  /** Minimum off-ramp amount (provider-enforced) */
  minimumOfframpCents: Cents;
  /** Target buffer above minimum — the "comfort zone" */
  bufferTargetCents: Cents;
  /** Maximum single off-ramp amount per day */
  maxDailyOfframpCents: Cents;
  /** Days of runway to maintain as target */
  targetRunwayDays: number;
}

// ── Offramp Decision ─────────────────────────────────

interface OfframpDecision {
  shouldOfframp: boolean;
  reason: string;
  amountCents: Cents;
}

// ── Obligation Input (invoices + debits combined) ────

interface ObligationInput {
  id: string;
  platform: 'google' | 'meta';
  type: 'invoice' | 'debit' | 'buffer';
  amountCents: Cents;
  dueDate: string;
  overdue: boolean;
}

// ── Runway Calculation ───────────────────────────────
// Returns the number of days the current bank balance can sustain spend.

export function calculateRunway(bankBalanceCents: Cents, dailySpendRateCents: Cents): number {
  if (dailySpendRateCents <= 0) return Infinity;
  return Math.floor(bankBalanceCents / dailySpendRateCents);
}

// ── Spend Forecast ───────────────────────────────────
// Projects total spend over N days based on active campaign budgets.

export function forecastSpend(
  campaigns: CampaignSpendProjection[],
  days: number,
): Cents {
  if (days <= 0) return 0 as Cents;

  const dailyTotal = campaigns
    .filter(c => c.status === 'active')
    .reduce((sum, c) => sum + (c.dailyBudgetCents as number), 0);

  return Math.round(dailyTotal * days) as Cents;
}

// ── Off-ramp Trigger Decision ────────────────────────
// Determines whether an off-ramp should be triggered and why.

export function shouldTriggerOfframp(
  bankBalanceCents: Cents,
  bufferThresholdCents: Cents,
  pendingSpendCents: Cents,
): OfframpDecision {
  const effectiveBalance = (bankBalanceCents - pendingSpendCents) as Cents;

  if (effectiveBalance < bufferThresholdCents) {
    const deficit = (bufferThresholdCents - effectiveBalance) as Cents;
    return {
      shouldOfframp: true,
      reason: `Effective balance $${(effectiveBalance / 100).toFixed(2)} below buffer threshold $${(bufferThresholdCents / 100).toFixed(2)} — deficit $${(deficit / 100).toFixed(2)}`,
      amountCents: deficit,
    };
  }

  return {
    shouldOfframp: false,
    reason: `Effective balance $${(effectiveBalance / 100).toFixed(2)} above buffer threshold $${(bufferThresholdCents / 100).toFixed(2)}`,
    amountCents: 0 as Cents,
  };
}

// ── Required Off-ramp Amount ─────────────────────────
// Calculates the exact off-ramp amount needed, clamped to provider constraints.

export function calculateRequiredOfframp(
  bankBalanceCents: Cents,
  bufferTargetCents: Cents,
  pendingObligationsCents: Cents,
  feeEstimateCents: Cents,
): Cents {
  // How much fiat we need: buffer + obligations + fees - current balance
  const required = (
    bufferTargetCents + pendingObligationsCents + feeEstimateCents - bankBalanceCents
  );

  if (required <= 0) return 0 as Cents;
  return required as Cents;
}

// ── Obligation Prioritization ────────────────────────
// Sorts obligations by urgency: overdue first, then by due date.

export function prioritizeAllObligations(
  invoices: ObligationInput[],
  debits: ObligationInput[],
  bufferNeeds: ObligationInput[],
): PendingObligation[] {
  const all: PendingObligation[] = [...invoices, ...debits, ...bufferNeeds].map(o => ({
    id: o.id,
    platform: o.platform,
    amountCents: o.amountCents,
    dueDate: o.dueDate,
    overdue: o.overdue,
  }));

  return prioritizeObligations(all);
}

// ── Funding Plan Generation ──────────────────────────
// Creates a FundingPlan based on current treasury state and obligations.

export function generateFundingPlan(
  source: StablecoinFundingSource,
  bank: OperatingBankAccount,
  obligations: ObligationInput[],
  config: FundingPlanConfig,
  previousHash: string,
): FundingPlan | null {
  // Sum all pending obligation amounts
  const totalObligationsCents = obligations.reduce(
    (sum, o) => sum + (o.amountCents as number), 0,
  ) as Cents;

  // Calculate how much additional fiat we need
  const requiredCents = calculateRequiredOfframp(
    bank.availableBalanceCents,
    config.bufferTargetCents,
    totalObligationsCents,
    toCents(10), // conservative fee estimate
  );

  // No funding needed
  if (requiredCents <= 0) return null;

  // Clamp to maximum daily off-ramp
  const clampedCents = Math.min(requiredCents, config.maxDailyOfframpCents as number) as Cents;

  // Enforce minimum off-ramp amount
  if (clampedCents < (config.minimumOfframpCents as number)) {
    // If the required amount is below provider minimum but > 0, round up to minimum
    const finalCents = config.minimumOfframpCents;

    return createFundingPlan(
      determineFundingReason(obligations, bank),
      source.id,
      bank.id,
      determinePlatformTarget(obligations),
      finalCents,
      previousHash,
    );
  }

  return createFundingPlan(
    determineFundingReason(obligations, bank),
    source.id,
    bank.id,
    determinePlatformTarget(obligations),
    clampedCents,
    previousHash,
  );
}

// ── Daily Spend Rate ─────────────────────────────────
// Calculates the average daily spend rate from active campaigns.

export function calculateDailySpendRate(campaigns: CampaignSpendProjection[]): Cents {
  return campaigns
    .filter(c => c.status === 'active')
    .reduce((sum, c) => (sum + c.dailyBudgetCents) as Cents, 0 as Cents);
}

// ── Runway Forecast ──────────────────────────────────
// Combines balance, spend rate, and pending obligations into a runway projection.

export function forecastRunway(
  bankBalanceCents: Cents,
  campaigns: CampaignSpendProjection[],
  pendingObligationsCents: Cents,
): { runwayDays: number; dailySpendCents: Cents; effectiveBalanceCents: Cents } {
  const dailySpendCents = calculateDailySpendRate(campaigns);
  const effectiveBalanceCents = (bankBalanceCents - pendingObligationsCents) as Cents;
  const runwayDays = calculateRunway(
    Math.max(effectiveBalanceCents as number, 0) as Cents,
    dailySpendCents,
  );

  return { runwayDays, dailySpendCents, effectiveBalanceCents };
}

// ── Private Helpers ──────────────────────────────────

function determineFundingReason(
  obligations: ObligationInput[],
  bank: OperatingBankAccount,
): FundingPlanReason {
  // Check for overdue invoices first
  const hasOverdue = obligations.some(o => o.overdue);
  if (hasOverdue) return 'INVOICE_DUE';

  // Check for upcoming invoices within 7 days
  const sevenDaysOut = Date.now() + 7 * 24 * 60 * 60 * 1000;
  const hasUpcoming = obligations.some(
    o => o.type === 'invoice' && new Date(o.dueDate).getTime() <= sevenDaysOut,
  );
  if (hasUpcoming) return 'INVOICE_DUE';

  // Check if bank is below minimum buffer
  if (bank.availableBalanceCents < bank.minimumBufferCents) return 'LOW_BUFFER';

  // Default: runway shortfall
  return 'RUNWAY_SHORTFALL';
}

function determinePlatformTarget(obligations: ObligationInput[]): TargetPlatform {
  // If all obligations are for one platform, target that platform
  const platforms = new Set(obligations.map(o => o.platform));
  if (platforms.size === 1) {
    const platform = [...platforms][0];
    return platform;
  }
  // Mixed or no obligations: shared buffer
  return 'shared_buffer';
}

export type {
  CampaignSpendProjection, FundingPlanConfig, OfframpDecision, ObligationInput,
};
