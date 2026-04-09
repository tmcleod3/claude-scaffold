/**
 * Pattern: Stablecoin Treasury Adapter (Split Interface)
 *
 * Key principles:
 * - Split interface: StablecoinSetup (interactive CLI/Danger Room) + StablecoinAdapter (daemon runtime)
 * - Single-writer constraint: only Heartbeat daemon calls the runtime adapter
 * - Funding lifecycle: USDC held at provider → off-ramp instruction → fiat settlement at linked bank
 * - All amounts in branded integer cents (Cents type from financial-transaction.ts)
 * - Hash-chained TransferRecord for tamper-evident audit trail
 * - Idempotency keys on all write operations (off-ramp, cancel)
 * - Provider abstraction: Circle first-class, Bridge secondary, manual fallback
 * - The adapter does NOT move money between bank and ad platform — that is ad-billing-adapter.ts
 *
 * Agents: Dockson (treasury), Heartbeat daemon
 *
 * PRD Reference: §11.1A, §12.1, §12.4, §12.5
 *
 * Circle API reference (v1):
 *   Auth: Bearer token via API key — header `Authorization: Bearer {apiKey}`
 *   Base URL: https://api.circle.com/v1
 *   GET  /wallets                       → list wallets
 *   GET  /wallets/{id}/balances         → wallet balances (amount, currency, chain)
 *   GET  /configuration                 → supported chains and assets
 *   GET  /banks/wires                   → linked bank accounts
 *   POST /payouts                       → initiate wire payout (off-ramp)
 *   GET  /payouts/{id}                  → transfer status
 *   GET  /payouts?destination={bankId}  → list completed payouts for reconciliation
 *
 *   Response shape (balance):
 *     { data: { available: [{ amount: "1000.00", currency: "USD" }] } }
 *   Response shape (payout):
 *     { data: { id, status, amount: { amount, currency }, destination, createDate, updateDate } }
 *   Payout statuses: pending → processing → complete | failed
 *
 * Bridge API reference:
 *   Auth: API key header `Api-Key: {apiKey}`
 *   Base URL: https://api.bridge.xyz/v0
 *   POST /customers/{id}/liquidation_addresses → create liquidation address
 *   GET  /customers/{id}/liquidation_addresses → list addresses
 *   GET  /liquidation_addresses/{id}           → transfer status
 *   Transfers settle via ACH to linked bank — status polling required
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

// ── Provider and Asset Types ─────────────────────────

type StablecoinProvider = 'circle' | 'bridge';

interface SupportedAsset {
  asset: string;          // e.g., 'USDC'
  network: string;        // e.g., 'ETH', 'SOL', 'MATIC', 'AVAX'
  contractAddress: string;
  minRedemption: Cents;   // provider-enforced minimum off-ramp amount
}

interface ProviderCredentials {
  provider: StablecoinProvider;
  apiKey: string;
  environment: 'sandbox' | 'production';
}

// ── Balance Types ────────────────────────────────────

interface StablecoinBalance {
  provider: StablecoinProvider;
  asset: string;
  network: string;
  balanceCents: Cents;      // stablecoin value expressed in integer cents (1 USDC = 100 cents)
  lastUpdated: string;      // ISO 8601
}

interface FiatBalance {
  provider: 'mercury' | 'external';
  accountId: string;
  availableCents: Cents;
  pendingCents: Cents;
  currency: 'USD';
  lastUpdated: string;
}

interface CombinedBalances {
  stablecoin: StablecoinBalance[];
  fiat: FiatBalance[];
  totalStablecoinCents: Cents;
  totalFiatAvailableCents: Cents;
}

// ── Off-ramp Types ───────────────────────────────────

interface OfframpQuote {
  provider: StablecoinProvider;
  sourceAsset: string;
  sourceNetwork: string;
  requestedCents: Cents;
  estimatedFeeCents: Cents;
  estimatedNetCents: Cents;   // requestedCents - estimatedFeeCents
  estimatedSettlementMinutes: number;
  expiresAt: string;          // ISO 8601 — quote validity window
  quoteId?: string;           // provider-issued quote ID if applicable
}

type TransferStatus =
  | 'pending'       // instruction created, not yet submitted to provider
  | 'processing'    // provider accepted, settlement in progress
  | 'completed'     // fiat arrived at destination bank
  | 'failed'        // provider reported failure
  | 'cancelled';    // cancelled before completion

interface TransferRecord {
  id: string;                     // UUID v4
  fundingPlanId: string;          // links to FundingPlan in funding-plan.ts
  providerTransferId: string;     // provider's external ID
  bankTransactionId?: string;     // bank-side reference once settled
  provider: StablecoinProvider;
  direction: 'crypto_to_fiat';
  sourceAsset: string;
  sourceNetwork: string;
  amountCents: Cents;
  feesCents: Cents;
  netAmountCents: Cents;
  destinationBankId: string;
  status: TransferStatus;
  statusReason?: string;          // failure/cancellation reason
  initiatedAt: string;            // ISO 8601
  completedAt?: string;           // ISO 8601
  idempotencyKey: string;         // UUID, prevents duplicate off-ramps
  // Hash chain fields (per financial-transaction.ts pattern)
  previousHash: string;
  hash: string;
}

// ── Transfer Status Detail ──────────────────────────

interface TransferStatusDetail {
  transferId: string;
  providerTransferId: string;
  status: TransferStatus;
  amountCents: Cents;
  feesCents: Cents;
  initiatedAt: string;
  completedAt?: string;
  estimatedCompletionAt?: string;
  providerRawStatus: string;     // raw status string from provider for debugging
}

// ── Date Range ──────────────────────────────────────

interface DateRange {
  start: string;  // ISO 8601
  end: string;    // ISO 8601
}

// ── Interactive Setup Interface ─────────────────────
// Runs in CLI or Danger Room — requires user interaction.
// Called during `/cultivation install` when Stablecoin Treasury is selected.

interface StablecoinSetup {
  /** Verify provider API key is valid and has required permissions */
  authenticate(credentials: ProviderCredentials): Promise<{
    valid: boolean;
    accountId?: string;
    permissions?: string[];
    error?: string;
  }>;

  /** List stablecoins and networks the provider supports for off-ramp */
  verifySupportedAssets(credentials: ProviderCredentials): Promise<SupportedAsset[]>;

  /** Confirm the provider has a linked bank destination for wire/ACH payouts */
  verifyLinkedBank(credentials: ProviderCredentials): Promise<{
    linked: boolean;
    bankId?: string;
    bankName?: string;
    accountLast4?: string;
    error?: string;
  }>;

  /** Fetch current stablecoin balances for initial state snapshot */
  getInitialBalances(credentials: ProviderCredentials): Promise<StablecoinBalance[]>;
}

// ── Runtime Adapter Interface ───────────────────────
// Runs in heartbeat daemon ONLY — non-interactive, autonomous.
// Single-writer: no other process may call these methods.

interface StablecoinAdapter {
  /** Current stablecoin + fiat balances across all connected accounts */
  getBalances(): Promise<CombinedBalances>;

  /** Estimate fees, settlement time, and net proceeds for an off-ramp */
  quoteRedemption(amountCents: Cents): Promise<OfframpQuote>;

  /**
   * Create an off-ramp instruction with the provider.
   * Requires an idempotencyKey on the FundingPlan to prevent duplicate transfers.
   * Returns the created TransferRecord (with hash chain linking).
   */
  initiateOfframp(plan: FundingPlanRef, previousHash: string): Promise<TransferRecord>;

  /** Poll provider for transfer status updates */
  getTransferStatus(transferId: string): Promise<TransferStatusDetail>;

  /** Cancel a pending transfer if the provider supports cancellation */
  cancelTransfer(transferId: string): Promise<{
    cancelled: boolean;
    reason?: string;
  }>;

  /** List completed transfers in a date range for reconciliation */
  listCompletedTransfers(dateRange: DateRange): Promise<TransferRecord[]>;
}

// ── Funding Plan Reference ──────────────────────────
// Minimal reference passed from funding-plan.ts to avoid circular dependency.
// The full FundingPlan type lives in funding-plan.ts.

interface FundingPlanRef {
  id: string;
  sourceFundingId: string;
  destinationBankId: string;
  requiredCents: Cents;
  idempotencyKey: string;
}

// ── Hash Chain Helper ───────────────────────────────

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

// ── Reference Implementation Sketch: Circle ─────────
// Production implementation would live in wizard/lib/financial/stablecoin/circle.ts

class CircleAdapter implements StablecoinSetup, StablecoinAdapter {
  private readonly baseUrl = 'https://api.circle.com/v1';
  private apiKey: string = '';
  private bankId: string = '';

  constructor(private config: { apiKey: string; bankId: string; environment: 'sandbox' | 'production' }) {
    this.apiKey = config.apiKey;
    this.bankId = config.bankId;
    if (config.environment === 'sandbox') {
      // Circle sandbox base URL is the same but uses sandbox API keys
    }
  }

  // ── Setup (interactive) ──────────

  async authenticate(credentials: ProviderCredentials): Promise<{
    valid: boolean; accountId?: string; permissions?: string[]; error?: string;
  }> {
    // GET /configuration — verifies API key works
    // Circle returns { data: { payments: { masterWalletId } } }
    const res = await this.apiCall('GET', '/configuration');
    const data = res.data as Record<string, unknown> | undefined;
    const payments = data?.payments as Record<string, unknown> | undefined;
    return {
      valid: true,
      accountId: payments?.masterWalletId as string | undefined,
    };
  }

  async verifySupportedAssets(_credentials: ProviderCredentials): Promise<SupportedAsset[]> {
    // Circle supports USDC on ETH, SOL, MATIC, AVAX, etc.
    // GET /configuration → data.payments.supportedCurrencies
    // Hardcoded for pattern — real implementation queries the API
    return [
      { asset: 'USDC', network: 'ETH', contractAddress: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48', minRedemption: toCents(100) },
      { asset: 'USDC', network: 'SOL', contractAddress: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', minRedemption: toCents(100) },
      { asset: 'USDC', network: 'MATIC', contractAddress: '0x3c499c542cef5e3811e1192ce70d8cc03d5c3359', minRedemption: toCents(100) },
    ];
  }

  async verifyLinkedBank(_credentials: ProviderCredentials): Promise<{
    linked: boolean; bankId?: string; bankName?: string; accountLast4?: string; error?: string;
  }> {
    // GET /banks/wires — lists linked wire destinations
    // Response: { data: [{ id, description, trackingRef, bankAddress, billingDetails, status }] }
    const res = await this.apiCall('GET', '/banks/wires');
    const banks = res.data as Array<Record<string, unknown>> | undefined;
    if (!banks || banks.length === 0) {
      return { linked: false, error: 'No linked bank accounts found in Circle' };
    }
    const primary = banks[0];
    return {
      linked: true,
      bankId: primary.id as string,
      bankName: (primary.billingDetails as Record<string, unknown>)?.name as string | undefined,
      accountLast4: primary.trackingRef
        ? (primary.trackingRef as string).slice(-4)
        : undefined,
    };
  }

  async getInitialBalances(_credentials: ProviderCredentials): Promise<StablecoinBalance[]> {
    return this.fetchStablecoinBalances();
  }

  // ── Runtime (daemon) ──────────

  async getBalances(): Promise<CombinedBalances> {
    const stablecoin = await this.fetchStablecoinBalances();
    const totalStablecoinCents = stablecoin.reduce(
      (sum, b) => (sum + b.balanceCents) as Cents, 0 as Cents
    );
    // Fiat balances come from the bank adapter, not the stablecoin provider.
    // The caller (Treasury Planner) combines stablecoin + bank balances.
    return {
      stablecoin,
      fiat: [],
      totalStablecoinCents,
      totalFiatAvailableCents: 0 as Cents,
    };
  }

  async quoteRedemption(amountCents: Cents): Promise<OfframpQuote> {
    // Circle payout fees vary by destination and amount.
    // For wire payouts: typically $25 flat fee.
    // Settlement: 1-2 business days for domestic wire.
    const feeCents = toCents(25);
    return {
      provider: 'circle',
      sourceAsset: 'USDC',
      sourceNetwork: 'ETH',
      requestedCents: amountCents,
      estimatedFeeCents: feeCents,
      estimatedNetCents: (amountCents - feeCents) as Cents,
      estimatedSettlementMinutes: 24 * 60, // 1 business day estimate
      expiresAt: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
    };
  }

  async initiateOfframp(plan: FundingPlanRef, previousHash: string): Promise<TransferRecord> {
    // POST /payouts
    // Body: { idempotencyKey, source: { type: "wallet", id: "master" },
    //         destination: { type: "wire", id: bankId },
    //         amount: { amount: "1000.00", currency: "USD" },
    //         metadata: { beneficiaryEmail: "..." } }
    const res = await this.apiCall('POST', '/payouts', {
      idempotencyKey: plan.idempotencyKey,
      source: { type: 'wallet', id: 'master' },
      destination: { type: 'wire', id: this.bankId },
      amount: { amount: toDollars(plan.requiredCents).toFixed(2), currency: 'USD' },
    });

    const payout = res.data as Record<string, unknown>;
    const now = new Date().toISOString();
    const id = crypto.randomUUID();

    const record: Omit<TransferRecord, 'hash'> = {
      id,
      fundingPlanId: plan.id,
      providerTransferId: payout.id as string,
      provider: 'circle',
      direction: 'crypto_to_fiat',
      sourceAsset: 'USDC',
      sourceNetwork: 'ETH',
      amountCents: plan.requiredCents,
      feesCents: toCents(25),
      netAmountCents: (plan.requiredCents - toCents(25)) as Cents,
      destinationBankId: plan.destinationBankId,
      status: 'pending',
      initiatedAt: now,
      idempotencyKey: plan.idempotencyKey,
      previousHash,
    };

    const hash = computeTransferHash(record, previousHash);
    return { ...record, hash };
  }

  async getTransferStatus(transferId: string): Promise<TransferStatusDetail> {
    // GET /payouts/{id}
    // Response: { data: { id, status, amount, fees, createDate, updateDate } }
    // Circle statuses: pending → processing → complete | failed
    const res = await this.apiCall('GET', `/payouts/${transferId}`);
    const payout = res.data as Record<string, unknown>;
    const amount = payout.amount as Record<string, string>;
    const fees = payout.fees as Record<string, string> | undefined;

    return {
      transferId,
      providerTransferId: payout.id as string,
      status: mapCircleStatus(payout.status as string),
      amountCents: toCents(parseFloat(amount.amount)),
      feesCents: fees ? toCents(parseFloat(fees.amount)) : (0 as Cents),
      initiatedAt: payout.createDate as string,
      completedAt: payout.status === 'complete' ? payout.updateDate as string : undefined,
      providerRawStatus: payout.status as string,
    };
  }

  async cancelTransfer(transferId: string): Promise<{ cancelled: boolean; reason?: string }> {
    // Circle does not support cancellation of payouts once processing begins.
    // Only pending payouts may be cancellable via support — no direct API.
    return {
      cancelled: false,
      reason: 'Circle does not support programmatic payout cancellation. Contact support for pending payouts.',
    };
  }

  async listCompletedTransfers(dateRange: DateRange): Promise<TransferRecord[]> {
    // GET /payouts?destination={bankId}&status=complete
    //   &pageBefore=...&pageAfter=...
    // Filter by createDate within dateRange on the client side.
    // Returns array of TransferRecords for reconciliation.
    // In production: paginate and filter by date.
    throw new Error('HTTP implementation — use node:https, no SDK dependencies');
  }

  // ── Private helpers ──────────

  private async fetchStablecoinBalances(): Promise<StablecoinBalance[]> {
    // GET /wallets/master/balances (or /wallets → pick master → /ballets/{id}/balances)
    // Response: { data: { available: [{ amount: "1500.50", currency: "USD" }] } }
    const res = await this.apiCall('GET', '/wallets');
    const wallets = res.data as Array<Record<string, unknown>>;
    const now = new Date().toISOString();

    const balances: StablecoinBalance[] = [];
    for (const wallet of wallets) {
      const available = (wallet.balances as Array<Record<string, string>>) ?? [];
      for (const bal of available) {
        if (bal.currency === 'USD') {
          balances.push({
            provider: 'circle',
            asset: 'USDC',
            network: 'ETH', // Circle aggregates across chains for USD balance
            balanceCents: toCents(parseFloat(bal.amount)),
            lastUpdated: now,
          });
        }
      }
    }
    return balances;
  }

  private async apiCall(
    method: string,
    path: string,
    body?: Record<string, unknown>
  ): Promise<Record<string, unknown>> {
    // Implementation: raw HTTPS (no SDK — zero dependency principle)
    // Headers:
    //   Authorization: Bearer {this.apiKey}
    //   Content-Type: application/json
    //   Accept: application/json
    // Sanitize response strings per §9.19.16 before returning
    throw new Error('HTTP implementation — use node:https, no SDK dependencies');
  }
}

// ── Status Mapping ──────────────────────────────────

function mapCircleStatus(circleStatus: string): TransferStatus {
  switch (circleStatus) {
    case 'pending': return 'pending';
    case 'processing': return 'processing';
    case 'complete': return 'completed';
    case 'failed': return 'failed';
    default: return 'pending';
  }
}

// ── Framework Adaptation Notes ──────────────────────
//
// Express/Node.js:
//   - Setup routes in /api/treasury/setup/* (interactive, session-authed)
//   - Runtime methods called by Heartbeat scheduler only (daemon-process.ts)
//   - Use idempotencyKey middleware on POST routes
//
// Django/FastAPI:
//   - StablecoinSetup maps to ViewSet with session auth
//   - StablecoinAdapter methods become Celery/ARQ tasks (single-worker queue)
//   - Use django.db.transaction.atomic() for TransferRecord persistence
//
// Next.js:
//   - Setup API routes under /api/treasury/stablecoin/*
//   - Server actions for interactive verification steps
//   - Runtime adapter runs in separate worker process, not in Next.js server

export type {
  StablecoinSetup, StablecoinAdapter,
  StablecoinProvider, SupportedAsset, ProviderCredentials,
  StablecoinBalance, FiatBalance, CombinedBalances,
  OfframpQuote, TransferStatus, TransferRecord, TransferStatusDetail,
  FundingPlanRef, DateRange,
};
export { toCents, toDollars, computeTransferHash, mapCircleStatus, CircleAdapter };
