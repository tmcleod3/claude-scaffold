/**
 * Pattern: Funding Plan (Core Data Structure + Pure Logic)
 *
 * Key principles:
 * - The FundingPlan is the central data structure connecting:
 *     stablecoin source → off-ramp → bank settlement → platform billing
 * - Plans are IMMUTABLE once approved — state transitions only, no field edits
 * - Hash-chained for tamper-evident audit trail (per financial-transaction.ts)
 * - All monetary values use branded integer cents (Cents type)
 * - Pure logic functions: no I/O, no side effects, fully testable
 * - Single-writer: only Heartbeat daemon creates and transitions FundingPlans
 *
 * Agents: Dockson (treasury), Heartbeat daemon
 *
 * PRD Reference: §12.1, §12.2, §12.4, §12.5, §12.6, §13, §15
 */

import { createHash } from 'node:crypto';

// ── Branded Financial Types (from financial-transaction.ts) ──

type Cents = number & { readonly __brand: 'Cents' };

function toCents(dollars: number): Cents {
  return Math.round(dollars * 100) as Cents;
}

function toDollars(cents: Cents): number {
  return cents / 100;
}

// ── Stablecoin Funding Source (PRD §12.1) ────────────

type StablecoinProviderType = 'circle' | 'bridge' | 'manual';

interface StablecoinFundingSource {
  id: string;                               // UUID v4
  provider: StablecoinProviderType;
  asset: string;                            // 'USDC' in V1
  network: string;                          // 'ETH', 'SOL', 'MATIC', etc.
  sourceAccountId: string;                  // provider-specific wallet/account ID
  whitelistedDestinationBankId: string;     // only this bank can receive off-ramps
  status: 'active' | 'suspended' | 'unconfigured';
}

// ── Operating Bank Account (PRD §12.2) ───────────────

type BankProvider = 'mercury' | 'external';

interface OperatingBankAccount {
  id: string;                     // UUID v4
  provider: BankProvider;
  accountId: string;              // bank-specific account identifier
  currency: 'USD';                // USD-only in V1
  availableBalanceCents: Cents;
  reservedBalanceCents: Cents;    // earmarked for pending settlements
  minimumBufferCents: Cents;      // floor below which off-ramp triggers
}

// ── Platform Billing Profile (PRD §12.3) ────────────
// Re-exported from ad-billing-adapter.ts for convenience.

type CapabilityState = 'FULLY_FUNDABLE' | 'MONITORED_ONLY' | 'UNSUPPORTED';
type BillingMode =
  | 'monthly_invoicing'
  | 'direct_debit'
  | 'extended_credit'
  | 'manual_bank_transfer'
  | 'card_only'
  | 'unknown';
type AdPlatform = 'google' | 'meta';

interface PlatformBillingProfile {
  platform: AdPlatform;
  capabilityState: CapabilityState;
  billingMode: BillingMode;
  externalAccountId: string;
  billingSetupId?: string;
  invoiceGroupId?: string;
  paymentProfileId?: string;
  fundingSourceId?: string;
  currency: 'USD';
  nextDueDate?: string;           // ISO 8601
  status: 'active' | 'degraded' | 'suspended' | 'unconfigured';
}

// ── Funding Plan (PRD §12.4) ────────────────────────

type FundingPlanStatus =
  | 'DRAFT'               // created, not yet approved
  | 'APPROVED'            // approved by policy or human, awaiting execution
  | 'PENDING_SETTLEMENT'  // off-ramp initiated, waiting for bank settlement
  | 'SETTLED'             // fiat arrived at bank, plan complete
  | 'FAILED'              // off-ramp or settlement failed
  | 'FROZEN';             // frozen by circuit breaker or manual freeze

type FundingPlanReason =
  | 'LOW_BUFFER'          // bank balance below minimum buffer
  | 'INVOICE_DUE'         // Google invoice approaching due date
  | 'RUNWAY_SHORTFALL'    // projected spend exceeds available fiat runway
  | 'MANUAL_REQUEST';     // user-initiated funding request

type ApprovalMode =
  | 'policy_auto'         // rules engine approved automatically
  | 'vault_manual'        // user approved via vault password
  | 'totp_required';      // user approved via vault + TOTP (high-risk actions)

type TargetPlatform = AdPlatform | 'shared_buffer';

interface FundingPlan {
  id: string;                         // UUID v4
  createdAt: string;                  // ISO 8601
  updatedAt: string;                  // ISO 8601
  reason: FundingPlanReason;
  sourceFundingId: string;            // → StablecoinFundingSource.id
  destinationBankId: string;          // → OperatingBankAccount.id
  targetPlatform: TargetPlatform;     // which platform this funding supports
  requiredCents: Cents;               // how much fiat is needed
  reservedCents: Cents;               // how much has been earmarked at the bank
  status: FundingPlanStatus;
  approvalMode: ApprovalMode;
  approvedAt?: string;                // ISO 8601
  approvedBy?: string;                // 'policy_engine' | 'user:{hashedId}'
  settledAt?: string;                 // ISO 8601
  failureReason?: string;
  idempotencyKey: string;             // UUID, prevents duplicate off-ramps
  // Hash chain fields
  previousHash: string;
  hash: string;
}

// ── Transfer Record (PRD §12.5) ─────────────────────

type TransferDirection = 'crypto_to_fiat' | 'bank_to_platform' | 'platform_debit';
type TransferStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';

interface TransferRecord {
  id: string;                         // UUID v4
  fundingPlanId: string;              // → FundingPlan.id
  providerTransferId: string;         // stablecoin provider's transfer ID
  bankTransactionId?: string;         // bank-side reference once detected
  direction: TransferDirection;
  amountCents: Cents;
  feesCents: Cents;
  netAmountCents: Cents;              // amountCents - feesCents
  currency: 'USD';
  reference: string;                  // human-readable reference for matching
  status: TransferStatus;
  initiatedAt: string;                // ISO 8601
  completedAt?: string;               // ISO 8601
  // Hash chain fields (per financial-transaction.ts pattern)
  previousHash: string;
  hash: string;
}

// ── Reconciliation Record (PRD §12.6) ───────────────

type ReconciliationResult = 'MATCHED' | 'WITHIN_THRESHOLD' | 'MISMATCH';

interface ReconciliationRecord {
  id: string;                         // UUID v4
  platform: AdPlatform;
  date: string;                       // YYYY-MM-DD
  spendCents: Cents;                  // platform-reported ad spend
  bankSettledCents: Cents;            // bank transactions matched to this platform
  invoiceCents: Cents;                // invoiced amount (Google) or debit amount (Meta)
  varianceCents: Cents;               // absolute difference: |invoiceCents - bankSettledCents|
  result: ReconciliationResult;
  notes: string;
  createdAt: string;                  // ISO 8601
  // Hash chain fields
  previousHash: string;
  hash: string;
}

// ── Hash Chain Helpers ──────────────────────────────

function computePlanHash(plan: Omit<FundingPlan, 'hash'>, previousHash: string): string {
  const payload = JSON.stringify({
    id: plan.id,
    reason: plan.reason,
    sourceFundingId: plan.sourceFundingId,
    destinationBankId: plan.destinationBankId,
    requiredCents: plan.requiredCents,
    status: plan.status,
    createdAt: plan.createdAt,
    idempotencyKey: plan.idempotencyKey,
  }) + previousHash;
  return createHash('sha256').update(payload).digest('hex');
}

function computeTransferHash(record: Omit<TransferRecord, 'hash'>, previousHash: string): string {
  const payload = JSON.stringify({
    id: record.id,
    fundingPlanId: record.fundingPlanId,
    providerTransferId: record.providerTransferId,
    amountCents: record.amountCents,
    feesCents: record.feesCents,
    status: record.status,
    initiatedAt: record.initiatedAt,
  }) + previousHash;
  return createHash('sha256').update(payload).digest('hex');
}

function computeReconciliationHash(
  record: Omit<ReconciliationRecord, 'hash'>,
  previousHash: string
): string {
  const payload = JSON.stringify({
    id: record.id,
    platform: record.platform,
    date: record.date,
    spendCents: record.spendCents,
    bankSettledCents: record.bankSettledCents,
    invoiceCents: record.invoiceCents,
    varianceCents: record.varianceCents,
    result: record.result,
  }) + previousHash;
  return createHash('sha256').update(payload).digest('hex');
}

// ── Pure Logic: Funding Plan Creation ───────────────

function createFundingPlan(
  reason: FundingPlanReason,
  sourceFundingId: string,
  destinationBankId: string,
  targetPlatform: TargetPlatform,
  requiredCents: Cents,
  previousHash: string
): FundingPlan {
  const now = new Date().toISOString();
  const id = crypto.randomUUID();
  const idempotencyKey = crypto.randomUUID();

  const draft: Omit<FundingPlan, 'hash'> = {
    id,
    createdAt: now,
    updatedAt: now,
    reason,
    sourceFundingId,
    destinationBankId,
    targetPlatform,
    requiredCents,
    reservedCents: 0 as Cents,
    status: 'DRAFT',
    approvalMode: 'policy_auto',  // default; upgraded by approval logic
    idempotencyKey,
    previousHash,
  };

  const hash = computePlanHash(draft, previousHash);
  return { ...draft, hash };
}

// ── Pure Logic: Plan Approval ───────────────────────

function approvePlan(
  plan: FundingPlan,
  approvalMode: ApprovalMode,
  approvedBy: string
): FundingPlan {
  if (plan.status !== 'DRAFT') {
    throw new Error(`Cannot approve plan in status ${plan.status} — must be DRAFT`);
  }

  const now = new Date().toISOString();
  const approved: Omit<FundingPlan, 'hash'> = {
    ...plan,
    status: 'APPROVED',
    approvalMode,
    approvedBy,
    approvedAt: now,
    updatedAt: now,
    previousHash: plan.hash,
  };

  const hash = computePlanHash(approved, plan.hash);
  return { ...approved, hash };
}

// ── Pure Logic: Plan State Transitions ──────────────

function transitionPlan(
  plan: FundingPlan,
  newStatus: FundingPlanStatus,
  reason?: string
): FundingPlan {
  // Validate allowed transitions
  const allowedTransitions: Record<FundingPlanStatus, FundingPlanStatus[]> = {
    'DRAFT': ['APPROVED', 'FROZEN'],
    'APPROVED': ['PENDING_SETTLEMENT', 'FROZEN', 'FAILED'],
    'PENDING_SETTLEMENT': ['SETTLED', 'FAILED', 'FROZEN'],
    'SETTLED': [],           // terminal state
    'FAILED': ['DRAFT'],     // can retry by creating new draft
    'FROZEN': ['DRAFT'],     // can unfreeze to draft for re-approval
  };

  const allowed = allowedTransitions[plan.status];
  if (!allowed.includes(newStatus)) {
    throw new Error(
      `Invalid transition: ${plan.status} → ${newStatus}. Allowed: ${allowed.join(', ') || 'none (terminal)'}`
    );
  }

  const now = new Date().toISOString();
  const transitioned: Omit<FundingPlan, 'hash'> = {
    ...plan,
    status: newStatus,
    updatedAt: now,
    settledAt: newStatus === 'SETTLED' ? now : plan.settledAt,
    failureReason: newStatus === 'FAILED' ? reason : plan.failureReason,
    previousHash: plan.hash,
  };

  const hash = computePlanHash(transitioned, plan.hash);
  return { ...transitioned, hash };
}

// ── Pure Logic: Runway Calculation ──────────────────

function calculateRunway(bankBalanceCents: Cents, dailySpendRateCents: Cents): number {
  if (dailySpendRateCents <= 0) return Infinity;
  return Math.floor(bankBalanceCents / dailySpendRateCents);
}

// ── Pure Logic: Off-ramp Trigger Decision ───────────

function shouldTriggerOfframp(
  bankBalanceCents: Cents,
  bufferThresholdCents: Cents,
  pendingSpendCents: Cents,
  pendingOfframpCents: Cents
): boolean {
  // Available balance after accounting for pending obligations
  const effectiveBalance = (bankBalanceCents - pendingSpendCents + pendingOfframpCents) as Cents;
  return effectiveBalance < bufferThresholdCents;
}

// ── Pure Logic: Required Off-ramp Amount ────────────

function calculateRequiredOfframp(
  bankBalanceCents: Cents,
  bufferThresholdCents: Cents,
  pendingSpendCents: Cents,
  pendingOfframpCents: Cents,
  minimumOfframpCents: Cents
): Cents {
  const deficit = (bufferThresholdCents + pendingSpendCents - bankBalanceCents - pendingOfframpCents);
  if (deficit <= 0) return 0 as Cents;
  // Round up to minimum off-ramp amount if below provider minimum
  return Math.max(deficit, minimumOfframpCents) as Cents;
}

// ── Pure Logic: Reconciliation ──────────────────────

function reconcileTransfer(
  transferAmountCents: Cents,
  bankTransactionCents: Cents,
  platformSpendCents: Cents,
  thresholdBps: number,         // basis points tolerance (e.g., 50 = 0.5%)
  platform: AdPlatform,
  date: string,
  previousHash: string
): ReconciliationRecord {
  const invoiceCents = transferAmountCents;  // what was transferred
  const varianceCents = Math.abs(invoiceCents - bankTransactionCents) as Cents;

  // Determine result based on variance threshold
  let result: ReconciliationResult;
  if (varianceCents === 0) {
    result = 'MATCHED';
  } else {
    const varianceBps = invoiceCents > 0
      ? (varianceCents / invoiceCents) * 10_000
      : 0;
    result = varianceBps <= thresholdBps ? 'WITHIN_THRESHOLD' : 'MISMATCH';
  }

  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  const record: Omit<ReconciliationRecord, 'hash'> = {
    id,
    platform,
    date,
    spendCents: platformSpendCents,
    bankSettledCents: bankTransactionCents,
    invoiceCents,
    varianceCents,
    result,
    notes: result === 'MISMATCH'
      ? `Variance ${varianceCents} cents exceeds ${thresholdBps}bps threshold`
      : result === 'WITHIN_THRESHOLD'
        ? `Variance ${varianceCents} cents within ${thresholdBps}bps threshold`
        : 'Exact match',
    createdAt: now,
    previousHash,
  };

  const hash = computeReconciliationHash(record, previousHash);
  return { ...record, hash };
}

// ── Pure Logic: Invoice Priority ────────────────────
// When multiple invoices are pending, prioritize by due date and overdue status.

interface PendingObligation {
  id: string;
  platform: AdPlatform;
  amountCents: Cents;
  dueDate: string;  // ISO 8601
  overdue: boolean;
}

function prioritizeObligations(obligations: PendingObligation[]): PendingObligation[] {
  return [...obligations].sort((a, b) => {
    // Overdue items first
    if (a.overdue && !b.overdue) return -1;
    if (!a.overdue && b.overdue) return 1;
    // Then by due date (earliest first)
    return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
  });
}

// ── Framework Adaptation Notes ──────────────────────
//
// Express/Node.js:
//   - FundingPlan stored as JSONL append log (funding-plans.jsonl)
//   - TransferRecord stored as JSONL append log (transfers.jsonl)
//   - ReconciliationRecord stored as JSONL append log (reconciliation.jsonl)
//   - All writes go through atomicWrite() from financial-transaction.ts
//   - Only Heartbeat daemon writes — API reads from logs
//
// Django/FastAPI:
//   - FundingPlan as Django model with status FSM (django-fsm)
//   - TransferRecord as separate model with FK to FundingPlan
//   - ReconciliationRecord as daily snapshot model
//   - Single Celery worker for all write operations
//
// Next.js:
//   - Read API routes serve from JSONL logs
//   - Write operations proxied to Heartbeat daemon via Unix socket
//   - Dashboard components consume normalizeFundingState() output

export type {
  Cents,
  StablecoinProviderType, StablecoinFundingSource,
  BankProvider, OperatingBankAccount,
  CapabilityState, BillingMode, AdPlatform, PlatformBillingProfile,
  FundingPlanStatus, FundingPlanReason, ApprovalMode, TargetPlatform, FundingPlan,
  TransferDirection, TransferStatus, TransferRecord,
  ReconciliationResult, ReconciliationRecord,
  PendingObligation,
};
export {
  toCents, toDollars,
  computePlanHash, computeTransferHash, computeReconciliationHash,
  createFundingPlan, approvePlan, transitionPlan,
  calculateRunway, shouldTriggerOfframp, calculateRequiredOfframp,
  reconcileTransfer, prioritizeObligations,
};
