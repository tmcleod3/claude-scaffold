/**
 * Pattern: Ad Billing Adapter (Split Interface)
 *
 * Key principles:
 * - Billing is SEPARATE from campaign CRUD. This adapter handles how ad platforms
 *   get paid (invoices, direct debits, settlements), not how campaigns are managed.
 *   Campaign operations live in ad-platform-adapter.ts.
 * - Three capability states determine what Treasury can automate:
 *     FULLY_FUNDABLE   — Treasury manages settlement lifecycle end-to-end
 *     MONITORED_ONLY   — spend and billing are observed, but funding is not automated
 *     UNSUPPORTED      — billing configuration blocks any automation
 * - Split interface: AdBillingSetup (interactive) + AdBillingAdapter (runtime)
 * - Single-writer: only Heartbeat daemon calls the runtime adapter
 * - All amounts in branded integer cents (Cents type from financial-transaction.ts)
 *
 * Agents: Dockson (treasury), Wax (paid ads), Heartbeat daemon
 *
 * PRD Reference: §10.2, §11.1B, §12.3
 *
 * Google Ads Billing API reference:
 *   Billing setup: managed via Google Ads UI — no API for enabling monthly invoicing.
 *   Read-only API paths (Ads API v16+):
 *     BillingSetup resource   → billingSetup.status, paymentsAccount, paymentsProfile
 *     Invoice resource        → GET /customers/{id}/invoices (monthly invoicing accounts only)
 *       Fields: invoice.id, invoice.type, invoice.due_date, invoice.total_amount_micros
 *       Note: amounts in micros (1/1,000,000 of currency unit). Divide by 10,000 for cents.
 *   payments_account_id identifies the payments profile linked to billing.
 *   monthly_invoicing must be enabled by Google — not programmatically toggleable.
 *
 * Meta Ads Billing reference:
 *   No first-party invoice API. Billing is managed via:
 *     GET /act_{id}?fields=funding_source,funding_source_details → funding method classification
 *     funding_source_details.type: 1=credit_card, 2=debit_card, 4=direct_debit,
 *       5=paypal, 8=extended_credit, 11=invoice
 *   Direct debit: Meta pulls from linked bank. No settlement instruction needed.
 *   Extended credit / invoicing: available to qualifying business accounts.
 *   For direct debit accounts, Treasury maintains a buffer; for invoiced accounts,
 *   Treasury tracks due dates and settlement instructions.
 */

// ── Branded Financial Types (from financial-transaction.ts) ──

type Cents = number & { readonly __brand: 'Cents' };

function toCents(dollars: number): Cents {
  return Math.round(dollars * 100) as Cents;
}

// ── Capability and Billing Types ─────────────────────

type CapabilityState = 'FULLY_FUNDABLE' | 'MONITORED_ONLY' | 'UNSUPPORTED';

type BillingMode =
  | 'monthly_invoicing'     // Google: approved monthly invoicing
  | 'direct_debit'          // Meta: bank-backed autopay
  | 'extended_credit'       // Meta: extended credit / invoice path
  | 'manual_bank_transfer'  // manual wire/ACH with reference numbers
  | 'card_only'             // credit/debit card — not automatable
  | 'unknown';              // could not determine billing mode

type AdPlatform = 'google' | 'meta' | 'tiktok' | 'linkedin' | 'twitter' | 'reddit' | 'snap';

// ── Invoice and Debit Types ─────────────────────────

interface Invoice {
  id: string;                     // platform-specific invoice ID
  platform: AdPlatform;
  externalAccountId: string;
  amountCents: Cents;
  currency: 'USD';
  issueDate: string;              // ISO 8601
  dueDate: string;                // ISO 8601
  status: 'pending' | 'paid' | 'overdue' | 'cancelled';
  lineItems?: InvoiceLineItem[];
  paymentReference?: string;      // bank reference for settlement matching
}

interface InvoiceLineItem {
  description: string;
  amountCents: Cents;
  campaignId?: string;
}

interface ExpectedDebit {
  id: string;                     // internal tracking ID
  platform: AdPlatform;
  externalAccountId: string;
  estimatedAmountCents: Cents;    // estimated debit based on recent spend
  currency: 'USD';
  expectedDate: string;           // ISO 8601 — estimated debit date
  status: 'expected' | 'detected' | 'confirmed' | 'failed';
  bankTransactionId?: string;     // set once debit is detected in bank
}

// ── Settlement Types ────────────────────────────────

interface SettlementInstruction {
  invoiceId: string;
  platform: AdPlatform;
  payeeName: string;              // e.g., "Google Ads" or "Meta Platforms Inc"
  paymentMethod: 'wire' | 'ach' | 'direct_debit';
  amountCents: Cents;
  currency: 'USD';
  dueDate: string;                // ISO 8601
  bankReference?: string;         // reference number for wire/ACH
  routingNumber?: string;         // destination routing (for wire/ACH to platform)
  accountNumber?: string;         // destination account (for wire/ACH to platform)
  notes: string;                  // human-readable settlement summary
}

// ── Platform Billing Profile (PRD §12.3) ────────────

interface PlatformBillingProfile {
  platform: AdPlatform;
  capabilityState: CapabilityState;
  billingMode: BillingMode;
  externalAccountId: string;       // Google: customer ID, Meta: ad account ID
  billingSetupId?: string;         // Google: billing setup resource name
  invoiceGroupId?: string;         // Google: invoice group for consolidated billing
  paymentProfileId?: string;       // Google: payments profile ID
  fundingSourceId?: string;        // Meta: funding source ID
  currency: 'USD';
  nextDueDate?: string;            // ISO 8601
  status: 'active' | 'degraded' | 'suspended' | 'unconfigured';
  lastVerifiedAt: string;          // ISO 8601
}

// ── Billing Configuration ───────────────────────────

interface BillingConfiguration {
  billingMode: BillingMode;
  accountIds: {
    externalAccountId: string;
    billingSetupId?: string;
    invoiceGroupId?: string;
    paymentProfileId?: string;
    fundingSourceId?: string;
  };
  nextDueDate?: string;
  estimatedMonthlySpendCents?: Cents;
}

// ── Normalized Funding State ────────────────────────

interface NormalizedFundingState {
  platform: AdPlatform;
  capabilityState: CapabilityState;
  billingMode: BillingMode;
  outstandingCents: Cents;         // unpaid invoices or expected debits
  nextPaymentDueDate?: string;
  daysUntilNextPayment?: number;
  fundingHealthy: boolean;         // true if no overdue invoices and capability is not degraded
  warnings: string[];
}

// ── Date Range ──────────────────────────────────────

interface DateRange {
  start: string;  // ISO 8601
  end: string;    // ISO 8601
}

// ── Interactive Setup Interface ─────────────────────
// Runs in CLI or Danger Room during `/grow --setup`.
// Classifies each platform's billing capability.

interface AdBillingSetup {
  /** Determine what level of funding automation this platform supports */
  verifyBillingCapability(
    platform: AdPlatform,
    externalAccountId: string,
    tokens: { accessToken: string }
  ): Promise<CapabilityState>;

  /** Read the billing configuration details for storage in vault */
  readBillingConfiguration(
    platform: AdPlatform,
    externalAccountId: string,
    tokens: { accessToken: string }
  ): Promise<BillingConfiguration>;

  /** Auto-detect the billing mode from platform API responses */
  detectBillingMode(
    platform: AdPlatform,
    externalAccountId: string,
    tokens: { accessToken: string }
  ): Promise<BillingMode>;
}

// ── Runtime Adapter Interface ───────────────────────
// Runs in heartbeat daemon ONLY — non-interactive, autonomous.
// Single-writer: no other process may call these methods.

interface AdBillingAdapter {
  /** Current capability state — may degrade at runtime if billing config changes */
  getCapabilityState(platform: AdPlatform): Promise<CapabilityState>;

  /** List pending and paid invoices in date range (Google monthly invoicing) */
  readInvoices(platform: AdPlatform, dateRange: DateRange): Promise<Invoice[]>;

  /** List expected bank debits in date range (Meta direct debit) */
  readExpectedDebits(platform: AdPlatform, dateRange: DateRange): Promise<ExpectedDebit[]>;

  /** Generate a settlement instruction for a specific invoice */
  generateSettlementInstructions(invoice: Invoice): Promise<SettlementInstruction>;

  /** Confirm that an invoice was settled by linking to a bank transaction */
  confirmSettlement(invoiceId: string, bankTransactionId: string): Promise<{
    confirmed: boolean;
    reconciledAmountCents: Cents;
    varianceCents: Cents;
  }>;

  /** Unified funding view across all connected platforms */
  normalizeFundingState(): Promise<NormalizedFundingState[]>;
}

// ── Reference Implementation: Google Billing ─────────
// Production implementation would live in wizard/lib/financial/billing/google-billing.ts

class GoogleBillingAdapter implements AdBillingSetup, AdBillingAdapter {
  private readonly adsApiUrl = 'https://googleads.googleapis.com/v16';
  private profiles: Map<string, PlatformBillingProfile> = new Map();

  // ── Setup (interactive) ──────────

  async verifyBillingCapability(
    _platform: AdPlatform,
    externalAccountId: string,
    tokens: { accessToken: string }
  ): Promise<CapabilityState> {
    const mode = await this.detectBillingMode('google', externalAccountId, tokens);
    if (mode === 'monthly_invoicing') return 'FULLY_FUNDABLE';
    if (mode === 'manual_bank_transfer') return 'MONITORED_ONLY';
    if (mode === 'unknown' || mode === 'card_only') return 'UNSUPPORTED';
    return 'MONITORED_ONLY';
  }

  async readBillingConfiguration(
    _platform: AdPlatform,
    externalAccountId: string,
    tokens: { accessToken: string }
  ): Promise<BillingConfiguration> {
    // Google Ads API: query billing_setup resource
    // SELECT billing_setup.id, billing_setup.status, billing_setup.payments_account,
    //        billing_setup.payments_profile
    // FROM billing_setup
    const billingSetup = await this.queryBillingSetup(externalAccountId, tokens);
    const mode = this.classifyGoogleBillingMode(billingSetup);

    return {
      billingMode: mode,
      accountIds: {
        externalAccountId,
        billingSetupId: billingSetup.id as string | undefined,
        paymentProfileId: billingSetup.paymentsProfile as string | undefined,
      },
    };
  }

  async detectBillingMode(
    _platform: AdPlatform,
    externalAccountId: string,
    tokens: { accessToken: string }
  ): Promise<BillingMode> {
    const billingSetup = await this.queryBillingSetup(externalAccountId, tokens);
    return this.classifyGoogleBillingMode(billingSetup);
  }

  // ── Runtime (daemon) ──────────

  async getCapabilityState(_platform: AdPlatform): Promise<CapabilityState> {
    // Re-verify from cached profile — full re-check happens on scheduled interval
    const profile = this.profiles.get('google');
    return profile?.capabilityState ?? 'UNSUPPORTED';
  }

  async readInvoices(_platform: AdPlatform, dateRange: DateRange): Promise<Invoice[]> {
    // Google Ads API: query invoice resource
    // SELECT invoice.id, invoice.type, invoice.due_date,
    //        invoice.service_date_range, invoice.total_amount_micros,
    //        invoice.payments_account_id
    // FROM invoice
    // WHERE invoice.issue_date >= '{dateRange.start}'
    //   AND invoice.issue_date <= '{dateRange.end}'
    //
    // Amounts are in micros: divide by 10,000 to get cents
    // e.g., 1,500,000,000 micros = $1,500.00 = 150,000 cents
    throw new Error('HTTP implementation — use node:https with Google Ads REST API');
  }

  async readExpectedDebits(_platform: AdPlatform, _dateRange: DateRange): Promise<ExpectedDebit[]> {
    // Google does not use direct debit in the monthly invoicing flow.
    // This method returns empty for Google — debits are a Meta concept.
    return [];
  }

  async generateSettlementInstructions(invoice: Invoice): Promise<SettlementInstruction> {
    // Google monthly invoicing: payment via wire/ACH to Google's bank account
    // Payment instructions are on the invoice itself.
    // Reference number must be included for matching.
    return {
      invoiceId: invoice.id,
      platform: 'google',
      payeeName: 'Google Ads',
      paymentMethod: 'wire',
      amountCents: invoice.amountCents,
      currency: 'USD',
      dueDate: invoice.dueDate,
      bankReference: invoice.paymentReference,
      notes: `Google monthly invoice ${invoice.id} — wire payment with reference ${invoice.paymentReference ?? 'see invoice'}`,
    };
  }

  async confirmSettlement(invoiceId: string, bankTransactionId: string): Promise<{
    confirmed: boolean; reconciledAmountCents: Cents; varianceCents: Cents;
  }> {
    // Match bank transaction amount against invoice amount.
    // In production: read from bank adapter + invoice store.
    // Variance threshold: configurable, default 0 cents for exact match.
    throw new Error('Implementation requires invoice store + bank adapter integration');
  }

  async normalizeFundingState(): Promise<NormalizedFundingState[]> {
    const profile = this.profiles.get('google');
    if (!profile) return [];

    const invoices = await this.readInvoices('google', {
      start: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString(),
      end: new Date().toISOString(),
    });
    const pending = invoices.filter(i => i.status === 'pending' || i.status === 'overdue');
    const outstandingCents = pending.reduce(
      (sum, i) => (sum + i.amountCents) as Cents, 0 as Cents
    );
    const overdue = pending.some(i => i.status === 'overdue');

    return [{
      platform: 'google',
      capabilityState: profile.capabilityState,
      billingMode: profile.billingMode,
      outstandingCents,
      nextPaymentDueDate: profile.nextDueDate,
      daysUntilNextPayment: profile.nextDueDate
        ? Math.ceil((new Date(profile.nextDueDate).getTime() - Date.now()) / (24 * 60 * 60 * 1000))
        : undefined,
      fundingHealthy: !overdue && profile.status === 'active',
      warnings: overdue ? ['Overdue Google Ads invoice — settlement required'] : [],
    }];
  }

  // ── Private helpers ──────────

  private async queryBillingSetup(
    _externalAccountId: string, _tokens: { accessToken: string }
  ): Promise<Record<string, unknown>> {
    // POST {adsApiUrl}/customers/{id}/googleAds:searchStream
    // Body: { query: "SELECT billing_setup.id, ..." }
    // Headers: Authorization: Bearer {accessToken}, developer-token: {devToken}
    throw new Error('HTTP implementation — use node:https with Google Ads REST API');
  }

  private classifyGoogleBillingMode(billingSetup: Record<string, unknown>): BillingMode {
    const status = billingSetup.status as string | undefined;
    if (status === 'APPROVED') return 'monthly_invoicing';
    if (status === 'PENDING') return 'unknown';
    if (status === 'CANCELLED') return 'unknown';
    return 'unknown';
  }
}

// ── Reference Implementation: Meta Billing ───────────
// Production implementation would live in wizard/lib/financial/billing/meta-billing.ts

class MetaBillingAdapter implements AdBillingSetup, AdBillingAdapter {
  private readonly baseUrl = 'https://graph.facebook.com/v19.0';
  private profiles: Map<string, PlatformBillingProfile> = new Map();

  // ── Setup (interactive) ──────────

  async verifyBillingCapability(
    _platform: AdPlatform,
    externalAccountId: string,
    tokens: { accessToken: string }
  ): Promise<CapabilityState> {
    const mode = await this.detectBillingMode('meta', externalAccountId, tokens);
    if (mode === 'direct_debit' || mode === 'extended_credit') return 'FULLY_FUNDABLE';
    if (mode === 'card_only') return 'UNSUPPORTED';
    return 'MONITORED_ONLY';
  }

  async readBillingConfiguration(
    _platform: AdPlatform,
    externalAccountId: string,
    tokens: { accessToken: string }
  ): Promise<BillingConfiguration> {
    const mode = await this.detectBillingMode('meta', externalAccountId, tokens);
    return {
      billingMode: mode,
      accountIds: {
        externalAccountId,
      },
    };
  }

  async detectBillingMode(
    _platform: AdPlatform,
    externalAccountId: string,
    tokens: { accessToken: string }
  ): Promise<BillingMode> {
    // GET /act_{id}?fields=funding_source_details&access_token={token}
    // Response: { funding_source_details: { id, type, display_string } }
    // type values: 1=credit_card, 2=debit_card, 4=direct_debit,
    //              5=paypal, 8=extended_credit, 11=invoice
    const res = await this.apiCall(
      'GET',
      `/act_${externalAccountId}`,
      tokens.accessToken,
      { fields: 'funding_source_details' }
    );
    const details = res.funding_source_details as Record<string, unknown> | undefined;
    const fundingType = details?.type as number | undefined;

    switch (fundingType) {
      case 4: return 'direct_debit';
      case 8: return 'extended_credit';
      case 11: return 'monthly_invoicing';
      case 1:
      case 2: return 'card_only';
      default: return 'unknown';
    }
  }

  // ── Runtime (daemon) ──────────

  async getCapabilityState(_platform: AdPlatform): Promise<CapabilityState> {
    const profile = this.profiles.get('meta');
    return profile?.capabilityState ?? 'UNSUPPORTED';
  }

  async readInvoices(_platform: AdPlatform, _dateRange: DateRange): Promise<Invoice[]> {
    // Meta does not expose a first-party invoice API for most account types.
    // For extended_credit accounts: invoices may be available via Business Manager.
    // In V1: return empty — Meta billing is tracked via expected debits.
    return [];
  }

  async readExpectedDebits(_platform: AdPlatform, dateRange: DateRange): Promise<ExpectedDebit[]> {
    // For direct debit accounts: estimate upcoming debits from recent spend.
    // Meta typically debits when spend threshold is reached or on billing date.
    // This is a forecast based on spend velocity, not a platform API call.
    // The actual debit is detected when it appears in the bank account.
    throw new Error('Implementation requires spend history + bank transaction detection');
  }

  async generateSettlementInstructions(invoice: Invoice): Promise<SettlementInstruction> {
    // Meta direct debit: no manual settlement needed — Meta pulls from bank.
    // Meta extended credit / invoicing: payment instructions on invoice.
    return {
      invoiceId: invoice.id,
      platform: 'meta',
      payeeName: 'Meta Platforms Inc',
      paymentMethod: 'direct_debit',
      amountCents: invoice.amountCents,
      currency: 'USD',
      dueDate: invoice.dueDate,
      notes: 'Meta direct debit — ensure sufficient bank balance before debit date',
    };
  }

  async confirmSettlement(invoiceId: string, bankTransactionId: string): Promise<{
    confirmed: boolean; reconciledAmountCents: Cents; varianceCents: Cents;
  }> {
    throw new Error('Implementation requires invoice store + bank adapter integration');
  }

  async normalizeFundingState(): Promise<NormalizedFundingState[]> {
    const profile = this.profiles.get('meta');
    if (!profile) return [];

    return [{
      platform: 'meta',
      capabilityState: profile.capabilityState,
      billingMode: profile.billingMode,
      outstandingCents: 0 as Cents, // Meta direct debit is pulled, not pushed
      nextPaymentDueDate: profile.nextDueDate,
      daysUntilNextPayment: profile.nextDueDate
        ? Math.ceil((new Date(profile.nextDueDate).getTime() - Date.now()) / (24 * 60 * 60 * 1000))
        : undefined,
      fundingHealthy: profile.status === 'active',
      warnings: profile.status === 'degraded'
        ? ['Meta billing degraded — check funding source status']
        : [],
    }];
  }

  // ── Private helpers ──────────

  private async apiCall(
    method: string,
    path: string,
    accessToken: string,
    params: Record<string, unknown>
  ): Promise<Record<string, unknown>> {
    // Implementation: raw HTTPS (no SDK — zero dependency principle)
    // Headers: Authorization: Bearer {accessToken}
    // Sanitize response strings per §9.19.16 before returning
    throw new Error('HTTP implementation — use node:https, no SDK dependencies');
  }
}

// ── Framework Adaptation Notes ──────────────────────
//
// Express/Node.js:
//   - Setup routes in /api/grow/billing/* (interactive, session-authed)
//   - Runtime methods called by Heartbeat scheduler only (daemon-process.ts)
//   - Billing adapter is a SEPARATE service from campaign adapter
//
// Django/FastAPI:
//   - AdBillingSetup maps to a ViewSet with session auth
//   - AdBillingAdapter methods become Celery/ARQ tasks (single-worker queue)
//   - Store PlatformBillingProfile in encrypted JSONField
//
// Next.js:
//   - Setup API routes under /api/grow/billing/*
//   - Server actions for interactive billing verification
//   - Runtime adapter runs in separate worker, NOT in Next.js server

export type {
  AdBillingSetup, AdBillingAdapter,
  CapabilityState, BillingMode, AdPlatform,
  Invoice, InvoiceLineItem, ExpectedDebit,
  SettlementInstruction, PlatformBillingProfile,
  BillingConfiguration, NormalizedFundingState, DateRange,
  Cents,
};
export { toCents, GoogleBillingAdapter, MetaBillingAdapter };
