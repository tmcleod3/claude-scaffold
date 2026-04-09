/**
 * Three-way reconciliation engine tests — transfer matching, variance classification, freeze logic.
 * Tier 1: Financial correctness — wrong reconciliation means undetected fund leaks.
 */

import { describe, it, expect } from 'vitest';
import {
  reconcileThreeWay,
  matchTransferToBank,
  classifyVariance,
  shouldFreeze,
} from '../lib/financial/reconciliation-engine.js';
import type {
  Cents,
  ProviderTransfer,
  BankTransaction,
  PlatformSpendEntry,
} from '../lib/financial/reconciliation-engine.js';

const cents = (n: number) => n as Cents;

// ── Helper factories ─────────────────────────────────

function makeTransfer(overrides: Partial<ProviderTransfer> = {}): ProviderTransfer {
  return {
    id: 'xfer-001',
    providerTransferId: 'prov-xfer-001',
    amountCents: cents(10_100),
    feesCents: cents(100),
    netAmountCents: cents(10_000),
    status: 'completed',
    initiatedAt: '2026-03-20T10:00:00Z',
    completedAt: '2026-03-20T12:00:00Z',
    reference: 'GOOG-INV-001',
    ...overrides,
  };
}

function makeBankTxn(overrides: Partial<BankTransaction> = {}): BankTransaction {
  return {
    id: 'bank-001',
    amountCents: cents(10_000),
    date: '2026-03-20',
    reference: 'GOOG-INV-001 settlement',
    counterparty: 'Circle Internet Financial',
    type: 'credit',
    ...overrides,
  };
}

function makeSpend(overrides: Partial<PlatformSpendEntry> = {}): PlatformSpendEntry {
  return {
    platform: 'google',
    date: '2026-03-20',
    spendCents: cents(5_000),
    ...overrides,
  };
}

// ── classifyVariance ─────────────────────────────────

describe('classifyVariance', () => {
  it('should return MATCHED when variance is zero', () => {
    expect(classifyVariance(cents(0), cents(10_000), 50)).toBe('MATCHED');
  });

  it('should return WITHIN_THRESHOLD when variance is under threshold bps', () => {
    // 400 / 10_000 = 4% = 400 bps. Threshold is 500 bps (5%).
    expect(classifyVariance(cents(400), cents(10_000), 500)).toBe('WITHIN_THRESHOLD');
  });

  it('should return MISMATCH when variance exceeds threshold bps', () => {
    // 600 / 10_000 = 6% = 600 bps. Threshold is 500 bps (5%).
    expect(classifyVariance(cents(600), cents(10_000), 500)).toBe('MISMATCH');
  });

  it('should return MISMATCH when reference is zero and variance is non-zero', () => {
    expect(classifyVariance(cents(100), cents(0), 500)).toBe('MISMATCH');
  });
});

// ── matchTransferToBank ──────────────────────────────

describe('matchTransferToBank', () => {
  it('should match by reference with exact amount', () => {
    const transfer = makeTransfer({ netAmountCents: cents(10_000), reference: 'REF-ABC' });
    const txns = [
      makeBankTxn({ id: 'b1', amountCents: cents(10_000), reference: 'REF-ABC settlement' }),
    ];
    const result = matchTransferToBank(transfer, txns);
    expect(result.bankTransactionId).toBe('b1');
    expect(result.varianceCents).toBe(0);
    expect(result.classification).toBe('MATCHED');
  });

  it('should match by closest amount when no reference match', () => {
    const transfer = makeTransfer({
      netAmountCents: cents(10_000),
      reference: undefined,
    });
    const txns = [
      makeBankTxn({ id: 'b1', amountCents: cents(9_900), reference: 'some other ref' }),
      makeBankTxn({ id: 'b2', amountCents: cents(10_050), reference: 'unrelated' }),
    ];
    const result = matchTransferToBank(transfer, txns);
    // b2 is closer (50 variance vs 100 variance)
    expect(result.bankTransactionId).toBe('b2');
    expect(result.varianceCents).toBe(50);
  });

  it('should return null bankTransactionId when no matching transactions exist', () => {
    const transfer = makeTransfer({ netAmountCents: cents(10_000), reference: undefined });
    // Only debit transactions (not matching)
    const txns = [
      makeBankTxn({ id: 'b1', amountCents: cents(10_000), type: 'debit' }),
    ];
    const result = matchTransferToBank(transfer, txns);
    expect(result.bankTransactionId).toBeNull();
    expect(result.classification).toBe('MISMATCH');
  });

  it('should return MISMATCH for non-completed transfers', () => {
    const transfer = makeTransfer({ status: 'pending' });
    const txns = [makeBankTxn()];
    const result = matchTransferToBank(transfer, txns);
    expect(result.bankTransactionId).toBeNull();
    expect(result.classification).toBe('MISMATCH');
  });
});

// ── reconcileThreeWay ────────────────────────────────

describe('reconcileThreeWay', () => {
  it('should match transfers to bank transactions when references align', () => {
    const transfers = [
      makeTransfer({ id: 'x1', netAmountCents: cents(10_000), reference: 'REF-A' }),
    ];
    const bankTxns = [
      makeBankTxn({ id: 'b1', amountCents: cents(10_000), reference: 'REF-A settlement' }),
    ];
    const report = reconcileThreeWay(transfers, bankTxns, []);
    expect(report.transferMatches).toHaveLength(1);
    expect(report.transferMatches[0].bankTransactionId).toBe('b1');
    expect(report.transferMatches[0].classification).toBe('MATCHED');
    expect(report.unmatchedTransfers).toHaveLength(0);
    expect(report.mismatchCount).toBe(0);
  });

  it('should report unmatched transfers when no bank transaction matches', () => {
    const transfers = [
      makeTransfer({ id: 'x1', netAmountCents: cents(10_000), reference: 'REF-B' }),
    ];
    // No bank transactions at all
    const report = reconcileThreeWay(transfers, [], []);
    expect(report.transferMatches).toHaveLength(1);
    expect(report.transferMatches[0].bankTransactionId).toBeNull();
    expect(report.unmatchedTransfers).toHaveLength(1);
    expect(report.mismatchCount).toBe(1);
  });

  it('should handle mixed matched and unmatched transfers', () => {
    const transfers = [
      makeTransfer({ id: 'x1', netAmountCents: cents(10_000), reference: 'REF-A' }),
      makeTransfer({ id: 'x2', netAmountCents: cents(5_000), reference: 'REF-MISSING' }),
    ];
    const bankTxns = [
      makeBankTxn({ id: 'b1', amountCents: cents(10_000), reference: 'REF-A settlement' }),
    ];
    const report = reconcileThreeWay(transfers, bankTxns, []);
    expect(report.transferMatches).toHaveLength(2);
    // x1 matched
    const x1Match = report.transferMatches.find(m => m.transferId === 'x1')!;
    expect(x1Match.bankTransactionId).toBe('b1');
    // x2 unmatched
    const x2Match = report.transferMatches.find(m => m.transferId === 'x2')!;
    expect(x2Match.bankTransactionId).toBeNull();
    expect(report.mismatchCount).toBe(1);
  });

  it('should calculate correct totals', () => {
    const transfers = [
      makeTransfer({ id: 'x1', netAmountCents: cents(10_000), reference: 'REF-A' }),
      makeTransfer({ id: 'x2', netAmountCents: cents(5_000), reference: 'REF-B' }),
    ];
    const bankTxns = [
      makeBankTxn({ id: 'b1', amountCents: cents(10_000), reference: 'REF-A settlement', type: 'credit' }),
      makeBankTxn({ id: 'b2', amountCents: cents(5_000), reference: 'REF-B settlement', type: 'credit' }),
    ];
    const spend: PlatformSpendEntry[] = [
      makeSpend({ spendCents: cents(3_000) }),
      makeSpend({ platform: 'meta', spendCents: cents(2_000) }),
    ];
    const report = reconcileThreeWay(transfers, bankTxns, spend);
    expect(report.totalTransferredCents).toBe(15_000);
    expect(report.totalBankReceivedCents).toBe(15_000);
    expect(report.totalPlatformSpendCents).toBe(5_000);
    expect(report.overallVarianceCents).toBe(0);
  });

  it('should skip non-completed transfers in matching', () => {
    const transfers = [
      makeTransfer({ id: 'x1', status: 'pending', netAmountCents: cents(10_000) }),
    ];
    const bankTxns = [makeBankTxn({ id: 'b1', amountCents: cents(10_000) })];
    const report = reconcileThreeWay(transfers, bankTxns, []);
    // Pending transfer should NOT be matched — still unmatched
    expect(report.transferMatches).toHaveLength(0);
    expect(report.unmatchedTransfers).toHaveLength(1);
    expect(report.totalTransferredCents).toBe(0);
  });
});

// ── shouldFreeze ─────────────────────────────────────

describe('shouldFreeze', () => {
  it('should return true when consecutive mismatches reach max', () => {
    expect(shouldFreeze(2, 2, 2)).toBe(true);
  });

  it('should return true when total mismatch count exceeds max', () => {
    expect(shouldFreeze(3, 1, 2)).toBe(true);
  });

  it('should return false when below threshold on both counts', () => {
    expect(shouldFreeze(1, 1, 2)).toBe(false);
  });

  it('should return false with zero mismatches', () => {
    expect(shouldFreeze(0, 0, 2)).toBe(false);
  });
});
