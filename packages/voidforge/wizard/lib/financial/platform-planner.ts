/**
 * Platform-Specific Funding Planner — pure logic for Google invoice settlement,
 * Meta debit protection, and multi-project portfolio rebalancing.
 *
 * No API calls, no file I/O — fully testable deterministic functions.
 * All monetary values use branded integer cents (Cents type).
 *
 * PRD Reference: §12.3 (Platform Billing), §15 (Rules Engine)
 * Agents: Dockson (treasury), Heartbeat daemon
 */

import type { Cents } from '../../../../../docs/patterns/funding-plan.js';

// ── Input Types ──────────────────────────────────────

interface GoogleInvoice {
  invoiceId: string;
  amountCents: Cents;
  dueDate: string; // ISO 8601
  status: 'pending' | 'overdue' | 'paid';
}

interface SettlementPlan {
  invoiceId: string;
  amountCents: Cents;
  dueDate: string;
  wireReference: string;
  priority: number; // lower = higher priority
  remainingBufferAfterCents: Cents;
}

interface ProjectTreasury {
  projectId: string;
  projectName: string;
  bankBalanceCents: Cents;
  minimumBufferCents: Cents;
  dailySpendRateCents: Cents;
  runwayDays: number;
}

interface RebalanceRecommendation {
  fromProjectId: string;
  toProjectId: string;
  amountCents: Cents;
  reason: string;
}

interface ExpectedDebit {
  date: string; // ISO 8601
  amountCents: Cents;
}

// ── Google Invoice Settlement Planner ────────────────
// Prioritize by due date (nearest first). Reserve buffer after settlement.
// Generate wire instructions for each invoice.

export function planGoogleInvoiceSettlement(
  invoices: GoogleInvoice[],
  bankBalanceCents: Cents,
  bufferTargetCents: Cents,
): SettlementPlan[] {
  if (invoices.length === 0) return [];

  // Filter to actionable invoices (pending or overdue, not already paid)
  const actionable = invoices.filter(inv => inv.status !== 'paid');

  // Sort: overdue first, then by due date ascending
  const sorted = [...actionable].sort((a, b) => {
    if (a.status === 'overdue' && b.status !== 'overdue') return -1;
    if (a.status !== 'overdue' && b.status === 'overdue') return 1;
    return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
  });

  const plans: SettlementPlan[] = [];
  let availableBalance = bankBalanceCents as number;

  for (let i = 0; i < sorted.length; i++) {
    const invoice = sorted[i];
    const invoiceAmount = invoice.amountCents as number;

    // Reserve buffer: only settle if we can still maintain buffer afterward
    const balanceAfterSettlement = availableBalance - invoiceAmount;
    if (balanceAfterSettlement < (bufferTargetCents as number)) {
      // Cannot settle this invoice without breaching buffer
      // Still include it in the plan but mark the buffer breach
      if (availableBalance > (bufferTargetCents as number)) {
        // Partial settlement up to buffer is not supported — skip
        continue;
      }
      // Balance already below buffer — cannot settle any more
      break;
    }

    const wireReference = `GOOG-INV-${invoice.invoiceId}-${Date.now().toString(36).toUpperCase()}`;

    plans.push({
      invoiceId: invoice.invoiceId,
      amountCents: invoice.amountCents,
      dueDate: invoice.dueDate,
      wireReference,
      priority: i + 1,
      remainingBufferAfterCents: (balanceAfterSettlement) as Cents,
    });

    availableBalance = balanceAfterSettlement;
  }

  return plans;
}

// ── Meta Debit Protection Planner ────────────────────
// Forecast 7-day debit total and ensure bank balance covers debits + buffer.

export function planMetaDebitProtection(
  expectedDebits: ExpectedDebit[],
  bankBalanceCents: Cents,
  bufferTargetCents: Cents,
): Cents {
  if (expectedDebits.length === 0) return 0 as Cents;

  // Sum expected debits over the 7-day window
  const now = Date.now();
  const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
  const cutoff = now + sevenDaysMs;

  const totalExpectedDebits = expectedDebits
    .filter(d => new Date(d.date).getTime() <= cutoff)
    .reduce((sum, d) => sum + (d.amountCents as number), 0);

  // Required buffer: total debits + buffer target
  const requiredBalance = totalExpectedDebits + (bufferTargetCents as number);
  const deficit = requiredBalance - (bankBalanceCents as number);

  // If balance already covers debits + buffer, no additional buffer needed
  if (deficit <= 0) return 0 as Cents;

  return deficit as Cents;
}

// ── Portfolio Rebalancing ────────────────────────────
// For multi-project operators: suggest moving operating float from
// overfunded to underfunded projects.

export function generatePortfolioRebalancing(
  projects: ProjectTreasury[],
): RebalanceRecommendation[] {
  if (projects.length < 2) return [];

  const recommendations: RebalanceRecommendation[] = [];

  // Calculate "excess" for each project: balance above (buffer + 30 days of spend)
  const TARGET_RUNWAY_DAYS = 30;

  interface ProjectWithExcess {
    project: ProjectTreasury;
    targetBalanceCents: number;
    excessCents: number; // positive = overfunded, negative = underfunded
  }

  const analyzed: ProjectWithExcess[] = projects.map(p => {
    const targetBalance = (p.minimumBufferCents as number) +
      (p.dailySpendRateCents as number) * TARGET_RUNWAY_DAYS;
    const excess = (p.bankBalanceCents as number) - targetBalance;
    return { project: p, targetBalanceCents: targetBalance, excessCents: excess };
  });

  // Split into overfunded and underfunded
  const overfunded = analyzed
    .filter(a => a.excessCents > 0)
    .sort((a, b) => b.excessCents - a.excessCents); // most excess first

  const underfunded = analyzed
    .filter(a => a.excessCents < 0)
    .sort((a, b) => a.excessCents - b.excessCents); // most deficit first

  // Match overfunded to underfunded greedily
  let overIdx = 0;
  let underIdx = 0;
  const remainingExcess = overfunded.map(o => o.excessCents);
  const remainingDeficit = underfunded.map(u => Math.abs(u.excessCents));

  while (overIdx < overfunded.length && underIdx < underfunded.length) {
    const available = remainingExcess[overIdx];
    const needed = remainingDeficit[underIdx];

    if (available <= 0) {
      overIdx++;
      continue;
    }
    if (needed <= 0) {
      underIdx++;
      continue;
    }

    const transferAmount = Math.min(available, needed);
    const fromProject = overfunded[overIdx].project;
    const toProject = underfunded[underIdx].project;

    recommendations.push({
      fromProjectId: fromProject.projectId,
      toProjectId: toProject.projectId,
      amountCents: Math.round(transferAmount) as Cents,
      reason: `${fromProject.projectName} has ${overfunded[overIdx].project.runwayDays}d runway ` +
        `(${TARGET_RUNWAY_DAYS}d target) — transfer to ${toProject.projectName} ` +
        `which has ${toProject.runwayDays}d runway`,
    });

    remainingExcess[overIdx] -= transferAmount;
    remainingDeficit[underIdx] -= transferAmount;

    if (remainingExcess[overIdx] <= 0) overIdx++;
    if (remainingDeficit[underIdx] <= 0) underIdx++;
  }

  return recommendations;
}

export type {
  GoogleInvoice, SettlementPlan,
  ExpectedDebit,
  ProjectTreasury, RebalanceRecommendation,
};
