/**
 * Financial Reporting + Export — daily reports, monthly ledgers, and funding simulation.
 *
 * Pure logic — no API calls, no file I/O, fully testable.
 * All monetary values use branded integer cents (Cents type).
 * Output formats: markdown (daily), JSON (monthly), simulation object.
 *
 * PRD Reference: §16 (Reporting and Reconciliation)
 * Agents: Dockson (treasury), Heartbeat daemon
 */

import type { Cents } from '../../../../../docs/patterns/funding-plan.js';
import type { ReconciliationReport } from './reconciliation-engine.js';
import type { CampaignSpendProjection, FundingPlanConfig } from './treasury-planner.js';
import { forecastSpend, calculateRunway } from './treasury-planner.js';
import { evaluatePolicy, aggregateDecisions } from './funding-policy.js';
import type { TreasuryState } from './funding-policy.js';

// ── Shared Helpers ───────────────────────────────────

function centsToUsd(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

// ── Daily Report Types ───────────────────────────────

interface DailyReportInput {
  date: string; // YYYY-MM-DD
  revenueCents: Cents;
  spendCents: Cents;
  stablecoinBalanceCents: Cents;
  pendingTransfersCents: Cents;
  bankBalanceCents: Cents;
  settledTodayCents: Cents;
  reconciliation: ReconciliationReport | null;
  activeCircuitBreakers: string[];
  runwayDays: number;
  fundingFrozen: boolean;
  freezeReason: string | null;
}

// ── Daily Report Generator ───────────────────────────

export function generateDailyReport(input: DailyReportInput): string {
  const netCents = (input.revenueCents as number) - (input.spendCents as number);
  const netSign = netCents >= 0 ? '+' : '';

  const lines: string[] = [
    `# Treasury Daily Report — ${input.date}`,
    '',
    '## Revenue & Spend',
    `| Metric | Amount |`,
    `|--------|--------|`,
    `| Revenue | ${centsToUsd(input.revenueCents as number)} |`,
    `| Spend | ${centsToUsd(input.spendCents as number)} |`,
    `| **Net** | **${netSign}${centsToUsd(netCents)}** |`,
    '',
    '## Stablecoin Position',
    `| Metric | Amount |`,
    `|--------|--------|`,
    `| Stablecoin Balance | ${centsToUsd(input.stablecoinBalanceCents as number)} |`,
    `| Pending Transfers | ${centsToUsd(input.pendingTransfersCents as number)} |`,
    '',
    '## Bank Position',
    `| Metric | Amount |`,
    `|--------|--------|`,
    `| Bank Balance | ${centsToUsd(input.bankBalanceCents as number)} |`,
    `| Settled Today | ${centsToUsd(input.settledTodayCents as number)} |`,
    `| Runway | ${input.runwayDays === Infinity ? 'Unlimited' : `${input.runwayDays} days`} |`,
    '',
  ];

  // Reconciliation section
  if (input.reconciliation) {
    const r = input.reconciliation;
    lines.push(
      '## Reconciliation',
      `| Metric | Value |`,
      `|--------|-------|`,
      `| Transfers Matched | ${r.transferMatches.length} |`,
      `| Spend Matched | ${r.spendMatches.length} |`,
      `| Unmatched Transfers | ${r.unmatchedTransfers.length} |`,
      `| Unmatched Bank Txns | ${r.unmatchedBankTransactions.length} |`,
      `| Overall Variance | ${centsToUsd(r.overallVarianceCents as number)} |`,
      `| Mismatches | ${r.mismatchCount} |`,
      '',
    );
  } else {
    lines.push('## Reconciliation', '', 'No reconciliation data for this date.', '');
  }

  // Circuit breakers
  if (input.activeCircuitBreakers.length > 0 || input.fundingFrozen) {
    lines.push('## Circuit Breakers', '');
    if (input.fundingFrozen) {
      lines.push(`**FUNDING FROZEN:** ${input.freezeReason ?? 'Unknown reason'}`, '');
    }
    for (const cb of input.activeCircuitBreakers) {
      lines.push(`- ${cb}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

// ── Monthly Ledger Types ─────────────────────────────

interface TransferLedgerEntry {
  id: string;
  date: string;
  direction: string;
  amountCents: Cents;
  feesCents: Cents;
  netAmountCents: Cents;
  status: string;
  reference: string;
}

interface ReconciliationLedgerEntry {
  id: string;
  date: string;
  platform: string;
  spendCents: Cents;
  bankSettledCents: Cents;
  varianceCents: Cents;
  result: string;
}

interface MonthlyLedger {
  month: string; // YYYY-MM
  generatedAt: string;
  transfers: TransferLedgerEntry[];
  reconciliations: ReconciliationLedgerEntry[];
  summary: {
    totalTransfersCents: Cents;
    totalFeesCents: Cents;
    totalNetTransferredCents: Cents;
    totalSpendCents: Cents;
    totalBankSettledCents: Cents;
    totalVarianceCents: Cents;
    transferCount: number;
    reconciliationCount: number;
    mismatchCount: number;
  };
}

// ── Monthly Ledger Generator ─────────────────────────

export function generateMonthlyLedger(
  month: string,
  transfers: TransferLedgerEntry[],
  reconciliations: ReconciliationLedgerEntry[],
): MonthlyLedger {
  const totalTransfersCents = transfers.reduce(
    (sum, t) => sum + (t.amountCents as number), 0,
  ) as Cents;

  const totalFeesCents = transfers.reduce(
    (sum, t) => sum + (t.feesCents as number), 0,
  ) as Cents;

  const totalNetTransferredCents = transfers.reduce(
    (sum, t) => sum + (t.netAmountCents as number), 0,
  ) as Cents;

  const totalSpendCents = reconciliations.reduce(
    (sum, r) => sum + (r.spendCents as number), 0,
  ) as Cents;

  const totalBankSettledCents = reconciliations.reduce(
    (sum, r) => sum + (r.bankSettledCents as number), 0,
  ) as Cents;

  const totalVarianceCents = reconciliations.reduce(
    (sum, r) => sum + (r.varianceCents as number), 0,
  ) as Cents;

  const mismatchCount = reconciliations.filter(r => r.result === 'MISMATCH').length;

  return {
    month,
    generatedAt: new Date().toISOString(),
    transfers,
    reconciliations,
    summary: {
      totalTransfersCents,
      totalFeesCents,
      totalNetTransferredCents,
      totalSpendCents,
      totalBankSettledCents,
      totalVarianceCents,
      transferCount: transfers.length,
      reconciliationCount: reconciliations.length,
      mismatchCount,
    },
  };
}

// ── Funding Simulation Types ─────────────────────────

interface SimulationDay {
  day: number;
  date: string;
  bankBalanceCents: Cents;
  spendCents: Cents;
  offrampTriggered: boolean;
  offrampAmountCents: Cents;
  policyBlocked: boolean;
  freezeRisk: boolean;
}

interface SimulationResult {
  config: {
    startDate: string;
    days: number;
    startingBankBalanceCents: Cents;
    bufferTargetCents: Cents;
    maxDailyOfframpCents: Cents;
  };
  days: SimulationDay[];
  summary: {
    firstOfframpDay: number | null;
    totalOfframpsCents: Cents;
    offrampCount: number;
    minimumBalanceCents: Cents;
    minimumBalanceDay: number;
    freezeRiskDays: number[];
    finalBalanceCents: Cents;
  };
}

// ── Funding Simulation ───────────────────────────────
// Projects forward N days showing when off-ramp triggers,
// expected bank balance trajectory, and freeze risk dates.

export function simulateFunding(
  startDate: string,
  startingBankBalanceCents: Cents,
  config: FundingPlanConfig,
  campaigns: CampaignSpendProjection[],
  days: number,
  stablecoinAvailableCents: Cents,
  minimumBufferCents: Cents,
): SimulationResult {
  const dailySpendCents = forecastSpend(campaigns, 1);
  const simDays: SimulationDay[] = [];

  let bankBalance = startingBankBalanceCents as number;
  let stablecoinRemaining = stablecoinAvailableCents as number;
  let firstOfframpDay: number | null = null;
  let totalOfframpsCents = 0;
  let offrampCount = 0;
  let minimumBalance = bankBalance;
  let minimumBalanceDay = 0;
  const freezeRiskDays: number[] = [];

  const startMs = new Date(startDate).getTime();
  const oneDayMs = 24 * 60 * 60 * 1000;

  for (let d = 0; d < days; d++) {
    const dayDate = new Date(startMs + d * oneDayMs).toISOString().slice(0, 10);
    const spend = dailySpendCents as number;

    // Deduct daily spend
    bankBalance -= spend;

    // Check if off-ramp should trigger
    let offrampTriggered = false;
    let offrampAmount = 0;
    let policyBlocked = false;
    let freezeRisk = false;

    if (bankBalance < (config.bufferTargetCents as number)) {
      // Need an off-ramp
      const deficit = (config.bufferTargetCents as number) - bankBalance;
      const clampedAmount = Math.min(
        deficit,
        config.maxDailyOfframpCents as number,
        stablecoinRemaining,
      );

      if (clampedAmount >= (config.minimumOfframpCents as number) && stablecoinRemaining > 0) {
        // Simulate policy evaluation
        const policyState: TreasuryState = {
          bankBalanceCents: bankBalance as Cents,
          minimumBufferCents,
          reservedCents: 0 as Cents,
          proposedOfframpCents: clampedAmount as Cents,
          maxDailyMovementCents: config.maxDailyOfframpCents,
          googleInvoiceDueSoon: false,
          googleInvoiceCents: 0 as Cents,
          metaUsesDirectDebit: false,
          metaForecast7DayCents: 0 as Cents,
          debitProtectionBufferCents: 0 as Cents,
          discrepancyExists: false,
          proposingBudgetRaise: false,
          platformCapability: 'FULLY_FUNDABLE',
          claimingAutonomousFunding: true,
        };

        const decisions = evaluatePolicy(policyState);
        const aggregate = aggregateDecisions(decisions);

        if (aggregate.action === 'allow') {
          offrampTriggered = true;
          offrampAmount = clampedAmount;
          bankBalance += clampedAmount;
          stablecoinRemaining -= clampedAmount;
          totalOfframpsCents += clampedAmount;
          offrampCount++;
          if (firstOfframpDay === null) firstOfframpDay = d + 1;
        } else {
          policyBlocked = true;
        }
      }
    }

    // Freeze risk: balance below minimum buffer
    if (bankBalance < (minimumBufferCents as number)) {
      freezeRisk = true;
      freezeRiskDays.push(d + 1);
    }

    // Track minimum balance
    if (bankBalance < minimumBalance) {
      minimumBalance = bankBalance;
      minimumBalanceDay = d + 1;
    }

    simDays.push({
      day: d + 1,
      date: dayDate,
      bankBalanceCents: Math.round(bankBalance) as Cents,
      spendCents: spend as Cents,
      offrampTriggered,
      offrampAmountCents: Math.round(offrampAmount) as Cents,
      policyBlocked,
      freezeRisk,
    });
  }

  return {
    config: {
      startDate,
      days,
      startingBankBalanceCents,
      bufferTargetCents: config.bufferTargetCents,
      maxDailyOfframpCents: config.maxDailyOfframpCents,
    },
    days: simDays,
    summary: {
      firstOfframpDay,
      totalOfframpsCents: Math.round(totalOfframpsCents) as Cents,
      offrampCount,
      minimumBalanceCents: Math.round(minimumBalance) as Cents,
      minimumBalanceDay,
      freezeRiskDays,
      finalBalanceCents: Math.round(bankBalance) as Cents,
    },
  };
}

export type {
  DailyReportInput,
  TransferLedgerEntry, ReconciliationLedgerEntry, MonthlyLedger,
  SimulationDay, SimulationResult,
};
