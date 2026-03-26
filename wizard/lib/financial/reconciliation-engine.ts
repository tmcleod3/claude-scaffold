/**
 * Three-Way Reconciliation Engine — pure logic for financial matching.
 *
 * Reconciles three data sources:
 * 1. Provider transfers (stablecoin off-ramp records)
 * 2. Bank transactions (settlement arrivals)
 * 3. Platform spend (ad platform reported spend)
 *
 * No API calls, no file I/O — fully testable deterministic functions.
 * Extends the existing reconciliation.ts pattern with stablecoin-specific matching.
 *
 * PRD Reference: §12.6 (ReconciliationRecord), §16 (Reporting and Reconciliation)
 * Agents: Dockson (treasury), Heartbeat daemon
 */

type Cents = number & { readonly __brand: 'Cents' };

// ── Input Types ──────────────────────────────────────

interface ProviderTransfer {
  id: string;
  providerTransferId: string;
  amountCents: Cents;
  feesCents: Cents;
  netAmountCents: Cents;
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';
  initiatedAt: string;
  completedAt?: string;
  reference?: string;
}

interface BankTransaction {
  id: string;
  amountCents: Cents;
  date: string;
  reference: string;
  counterparty: string;
  type: 'credit' | 'debit';
}

interface PlatformSpendEntry {
  platform: 'google' | 'meta';
  date: string;
  spendCents: Cents;
  invoiceId?: string;
}

// ── Match Result Types ───────────────────────────────

type VarianceClassification = 'MATCHED' | 'WITHIN_THRESHOLD' | 'MISMATCH';

interface TransferBankMatch {
  transferId: string;
  bankTransactionId: string | null;
  transferAmountCents: Cents;
  bankAmountCents: Cents;
  varianceCents: Cents;
  classification: VarianceClassification;
}

interface BankSpendMatch {
  bankTransactionId: string;
  platform: 'google' | 'meta';
  bankAmountCents: Cents;
  spendAmountCents: Cents;
  varianceCents: Cents;
  classification: VarianceClassification;
}

interface ReconciliationReport {
  date: string;
  transferMatches: TransferBankMatch[];
  spendMatches: BankSpendMatch[];
  unmatchedTransfers: ProviderTransfer[];
  unmatchedBankTransactions: BankTransaction[];
  unmatchedSpend: PlatformSpendEntry[];
  totalTransferredCents: Cents;
  totalBankReceivedCents: Cents;
  totalPlatformSpendCents: Cents;
  overallVarianceCents: Cents;
  mismatchCount: number;
}

// ── Variance Classification ──────────────────────────

export function classifyVariance(
  varianceCents: Cents,
  referenceCents: Cents,
  thresholdBps: number,
): VarianceClassification {
  if (varianceCents === 0) return 'MATCHED';

  // Basis points: 1 bps = 0.01% = 1/10,000
  if (referenceCents <= 0) {
    // Can't compute percentage on zero reference — any variance is a mismatch
    return varianceCents === 0 ? 'MATCHED' : 'MISMATCH';
  }

  const varianceBps = ((varianceCents as number) / (referenceCents as number)) * 10_000;
  return varianceBps <= thresholdBps ? 'WITHIN_THRESHOLD' : 'MISMATCH';
}

// ── Transfer-to-Bank Matching ────────────────────────

export function matchTransferToBank(
  transfer: ProviderTransfer,
  transactions: BankTransaction[],
  thresholdBps: number = 50,
): TransferBankMatch {
  // Only match completed transfers
  if (transfer.status !== 'completed') {
    return {
      transferId: transfer.id,
      bankTransactionId: null,
      transferAmountCents: transfer.netAmountCents,
      bankAmountCents: 0 as Cents,
      varianceCents: transfer.netAmountCents,
      classification: 'MISMATCH',
    };
  }

  // Find matching bank transaction by reference or amount proximity
  let bestMatch: BankTransaction | null = null;
  let bestVariance = Infinity;

  for (const txn of transactions) {
    // Only match credits (incoming funds)
    if (txn.type !== 'credit') continue;

    // Check reference match first (strongest signal)
    const refMatch = transfer.reference &&
      txn.reference.toLowerCase().includes(transfer.reference.toLowerCase());

    const variance = Math.abs(
      (transfer.netAmountCents as number) - (txn.amountCents as number),
    );

    // Reference match: accept with any variance within threshold
    if (refMatch && variance < bestVariance) {
      bestMatch = txn;
      bestVariance = variance;
    }

    // Amount proximity match: must be within threshold
    if (!refMatch && variance < bestVariance) {
      const varianceBps = (transfer.netAmountCents as number) > 0
        ? (variance / (transfer.netAmountCents as number)) * 10_000
        : Infinity;
      if (varianceBps <= thresholdBps * 2) {
        // Use 2x threshold for amount-only matching (less confident)
        bestMatch = txn;
        bestVariance = variance;
      }
    }
  }

  if (!bestMatch) {
    return {
      transferId: transfer.id,
      bankTransactionId: null,
      transferAmountCents: transfer.netAmountCents,
      bankAmountCents: 0 as Cents,
      varianceCents: transfer.netAmountCents,
      classification: 'MISMATCH',
    };
  }

  const varianceCents = Math.abs(
    (transfer.netAmountCents as number) - (bestMatch.amountCents as number),
  ) as Cents;

  return {
    transferId: transfer.id,
    bankTransactionId: bestMatch.id,
    transferAmountCents: transfer.netAmountCents,
    bankAmountCents: bestMatch.amountCents,
    varianceCents,
    classification: classifyVariance(varianceCents, transfer.netAmountCents, thresholdBps),
  };
}

// ── Bank-to-Platform-Spend Matching ──────────────────

export function matchBankToSpend(
  bankTransaction: BankTransaction,
  platformSpend: PlatformSpendEntry[],
  thresholdBps: number = 50,
): BankSpendMatch | null {
  // Only match debits (outgoing payments to platforms)
  if (bankTransaction.type !== 'debit') return null;

  // Find closest platform spend entry by amount
  let bestMatch: PlatformSpendEntry | null = null;
  let bestVariance = Infinity;

  for (const spend of platformSpend) {
    const variance = Math.abs(
      (bankTransaction.amountCents as number) - (spend.spendCents as number),
    );

    if (variance < bestVariance) {
      bestMatch = spend;
      bestVariance = variance;
    }
  }

  if (!bestMatch) return null;

  const varianceCents = bestVariance as Cents;
  const classification = classifyVariance(
    varianceCents,
    bankTransaction.amountCents,
    thresholdBps,
  );

  // Only return a match if it's within threshold or exact
  if (classification === 'MISMATCH') return null;

  return {
    bankTransactionId: bankTransaction.id,
    platform: bestMatch.platform,
    bankAmountCents: bankTransaction.amountCents,
    spendAmountCents: bestMatch.spendCents,
    varianceCents,
    classification,
  };
}

// ── Three-Way Reconciliation ─────────────────────────
// The main reconciliation function that ties all three sources together.

export function reconcileThreeWay(
  providerTransfers: ProviderTransfer[],
  bankTransactions: BankTransaction[],
  platformSpend: PlatformSpendEntry[],
  thresholdBps: number = 50,
): ReconciliationReport {
  const transferMatches: TransferBankMatch[] = [];
  const spendMatches: BankSpendMatch[] = [];
  const matchedBankIds = new Set<string>();
  const matchedSpendIndices = new Set<number>();

  // Phase 1: Match provider transfers to bank transactions
  const completedTransfers = providerTransfers.filter(t => t.status === 'completed');
  const remainingBankTxns = [...bankTransactions];

  for (const transfer of completedTransfers) {
    const match = matchTransferToBank(transfer, remainingBankTxns, thresholdBps);
    transferMatches.push(match);

    if (match.bankTransactionId) {
      matchedBankIds.add(match.bankTransactionId);
      // Remove matched bank transaction from remaining pool
      const idx = remainingBankTxns.findIndex(t => t.id === match.bankTransactionId);
      if (idx >= 0) remainingBankTxns.splice(idx, 1);
    }
  }

  // Phase 2: Match remaining bank debits to platform spend
  const remainingSpend = [...platformSpend];

  for (const bankTxn of remainingBankTxns) {
    if (matchedBankIds.has(bankTxn.id)) continue;

    const match = matchBankToSpend(bankTxn, remainingSpend, thresholdBps);
    if (match) {
      spendMatches.push(match);
      matchedBankIds.add(bankTxn.id);
      // Remove matched spend from remaining pool
      const spendIdx = remainingSpend.findIndex(
        s => s.spendCents === match.spendAmountCents && s.platform === match.platform,
      );
      if (spendIdx >= 0) {
        matchedSpendIndices.add(platformSpend.indexOf(remainingSpend[spendIdx]));
        remainingSpend.splice(spendIdx, 1);
      }
    }
  }

  // Phase 3: Identify unmatched items
  const unmatchedTransfers = providerTransfers.filter(t => {
    if (t.status !== 'completed') return true;
    const match = transferMatches.find(m => m.transferId === t.id);
    return !match || match.bankTransactionId === null;
  });

  const unmatchedBankTransactions = bankTransactions.filter(
    t => !matchedBankIds.has(t.id),
  );

  const unmatchedSpend = platformSpend.filter(
    (_, i) => !matchedSpendIndices.has(i),
  );

  // Phase 4: Calculate totals
  const totalTransferredCents = completedTransfers.reduce(
    (sum, t) => (sum + (t.netAmountCents as number)) as Cents,
    0 as Cents,
  );

  const totalBankReceivedCents = bankTransactions
    .filter(t => t.type === 'credit')
    .reduce(
      (sum, t) => (sum + (t.amountCents as number)) as Cents,
      0 as Cents,
    );

  const totalPlatformSpendCents = platformSpend.reduce(
    (sum, s) => (sum + (s.spendCents as number)) as Cents,
    0 as Cents,
  );

  const overallVarianceCents = Math.abs(
    (totalTransferredCents as number) - (totalBankReceivedCents as number),
  ) as Cents;

  const mismatchCount = transferMatches.filter(
    m => m.classification === 'MISMATCH',
  ).length;

  const today = new Date().toISOString().split('T')[0];

  return {
    date: today,
    transferMatches,
    spendMatches,
    unmatchedTransfers,
    unmatchedBankTransactions,
    unmatchedSpend,
    totalTransferredCents,
    totalBankReceivedCents,
    totalPlatformSpendCents,
    overallVarianceCents,
    mismatchCount,
  };
}

// ── Freeze Decision ──────────────────────────────────
// Determines if operations should be frozen based on consecutive mismatches.

export function shouldFreeze(
  mismatchCount: number,
  consecutiveCount: number,
  maxConsecutive: number,
): boolean {
  return consecutiveCount >= maxConsecutive || mismatchCount > maxConsecutive;
}

export type {
  Cents,
  ProviderTransfer, BankTransaction, PlatformSpendEntry,
  VarianceClassification, TransferBankMatch, BankSpendMatch,
  ReconciliationReport,
};
