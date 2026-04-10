/**
 * Treasury Circuit Breakers — evaluation logic for funding freeze conditions.
 *
 * Implements PRD S13.2 circuit breakers:
 *   CB-1: Provider unavailable for 3 consecutive polls
 *   CB-2: Off-ramp pending beyond SLA window (24 hours)
 *   CB-3: Reconciliation mismatch for 2 consecutive closes
 *   CB-4: Google invoice due soon + insufficient fiat
 *   CB-5: Meta debit fails or payment-risk state
 *   CB-6: Max daily treasury movement exceeded ($50,000 default)
 */

import type { Cents } from './financial-core.js';
import type { TreasuryHeartbeatState, PendingTransfer } from './treasury-io.js';

// ── Circuit Breaker Conditions (PRD S13.2) ───────────

export interface CircuitBreakerResult {
  shouldFreeze: boolean;
  reasons: string[];
}

export function evaluateCircuitBreakers(state: TreasuryHeartbeatState): CircuitBreakerResult {
  const reasons: string[] = [];

  // CB-1: Provider unavailable for 3 consecutive polls
  if (state.consecutiveProviderFailures >= 3) {
    reasons.push(
      `Stablecoin provider unavailable for ${state.consecutiveProviderFailures} consecutive polls — freeze funding`,
    );
  }

  // CB-2: Off-ramp pending beyond SLA window (24 hours)
  // Checked via pending transfers — caller handles this with transfer data

  // CB-3: Reconciliation mismatch for 2 consecutive closes
  if (state.consecutiveMismatches >= 2) {
    reasons.push(
      `Reconciliation mismatch for ${state.consecutiveMismatches} consecutive closes — freeze funding`,
    );
  }

  // CB-6: Max daily treasury movement exceeded ($50,000 default)
  const MAX_DAILY_MOVEMENT_CENTS = 5_000_000 as Cents; // $50,000
  if ((state.dailyMovementCents as Cents) > MAX_DAILY_MOVEMENT_CENTS) {
    reasons.push(
      `Daily treasury movement $${(state.dailyMovementCents / 100).toFixed(2)} exceeds max $${(MAX_DAILY_MOVEMENT_CENTS / 100).toFixed(2)} — freeze funding`,
    );
  }

  return {
    shouldFreeze: reasons.length > 0,
    reasons,
  };
}

/** Evaluate CB-2 specifically for pending transfers beyond SLA. */
export function evaluateTransferSlaBreaker(
  transfers: PendingTransfer[],
  slaHours: number = 24,
): CircuitBreakerResult {
  const reasons: string[] = [];
  const slaMs = slaHours * 60 * 60 * 1000;
  const now = Date.now();

  for (const t of transfers) {
    if (t.status !== 'pending' && t.status !== 'processing') continue;
    const age = now - new Date(t.initiatedAt).getTime();
    if (age > slaMs) {
      reasons.push(
        `Transfer ${t.id} pending for ${Math.round(age / (60 * 60 * 1000))}h — exceeds ${slaHours}h SLA — freeze funding`,
      );
    }
  }

  return {
    shouldFreeze: reasons.length > 0,
    reasons,
  };
}

/** Evaluate CB-4 and CB-5 from billing adapter state. */
export function evaluateBillingBreakers(opts: {
  googleInvoiceDueSoon: boolean;
  googleInvoiceCents: number;
  bankBalanceCents: number;
  minimumBufferCents: number;
  metaDebitFailed: boolean;
  metaPaymentRisk: boolean;
}): CircuitBreakerResult {
  const reasons: string[] = [];

  // CB-4: Google invoice due soon + insufficient fiat
  if (opts.googleInvoiceDueSoon) {
    const availableForInvoice = opts.bankBalanceCents - opts.minimumBufferCents;
    if (availableForInvoice < opts.googleInvoiceCents) {
      reasons.push(
        `Google invoice $${(opts.googleInvoiceCents / 100).toFixed(2)} due soon but only ` +
        `$${(availableForInvoice / 100).toFixed(2)} available — freeze non-essential funding`,
      );
    }
  }

  // CB-5: Meta debit fails or payment-risk state
  if (opts.metaDebitFailed) {
    reasons.push('Meta direct debit failed — freeze funding until bank balance confirmed');
  }
  if (opts.metaPaymentRisk) {
    reasons.push('Meta account in payment-risk state — freeze funding');
  }

  return {
    shouldFreeze: reasons.length > 0,
    reasons,
  };
}
