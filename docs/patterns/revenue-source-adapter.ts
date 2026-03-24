/**
 * Pattern: Revenue Source Adapter (Read-Only)
 *
 * Key principles:
 * - Read-only interface — VoidForge never processes payments directly
 * - Separate from AdPlatformAdapter — revenue in, ad spend out
 * - Polling with overlapping windows for gap-free coverage (ADR-5)
 * - Dedup by externalId to prevent double-counting
 * - Webhook signature verification mandatory when webhooks are implemented
 * - USD-only enforcement (ADR-6) at connection time
 *
 * Agents: Dockson (treasury), Vin (analytics)
 *
 * PRD Reference: §9.4, §9.9, §9.17 (polling improvements), ADR-5/ADR-6
 */

type Cents = number & { readonly __brand: 'Cents' };
type RevenueSource = 'stripe' | 'paddle';

// ── Revenue Source Interface ──────────────────────────

interface RevenueSourceAdapter {
  /** Establish connection and verify credentials work */
  connect(credentials: RevenueCredentials): Promise<ConnectionResult>;

  /** Detect the account's currency for ADR-6 enforcement */
  detectCurrency(credentials: RevenueCredentials): Promise<string>;

  /**
   * Fetch transactions in a date range.
   * Uses overlapping windows: fetch from (lastPollTime - 5 minutes) to now.
   * Dedup by externalId at the caller.
   */
  getTransactions(range: DateRange, cursor?: string): Promise<TransactionPage>;

  /** Get current account balance (optional — not all sources support this) */
  getBalance?(): Promise<BalanceResult>;

  /**
   * Verify webhook signature (mandatory when webhooks are implemented).
   * Deferred to remote mode per ADR-5 — not called in v11.x polling mode.
   */
  verifyWebhookSignature?(payload: Buffer, signature: string, secret: string): boolean;
}

// ── Types ─────────────────────────────────────────────

interface RevenueCredentials {
  source: RevenueSource;
  apiKey?: string;          // Stripe, Paddle (restricted, read-only)
  accessToken?: string;     // OAuth token (for future sources)
}

interface ConnectionResult {
  connected: boolean;
  accountId?: string;
  accountName?: string;
  currency?: string;        // ISO 4217
  error?: string;
}

interface DateRange {
  start: string;            // ISO 8601
  end: string;              // ISO 8601
}

interface TransactionPage {
  transactions: RevenueTransaction[];
  hasMore: boolean;
  cursor?: string;          // For pagination — store in daemon state for crash recovery
}

interface RevenueTransaction {
  externalId: string;       // Platform's transaction/event ID — dedup key
  type: 'charge' | 'subscription' | 'refund' | 'dispute';
  amount: Cents;            // Integer cents. Negative for refunds/disputes.
  currency: 'USD';          // Validated at ingest per ADR-6
  description: string;
  customerId?: string;      // Hashed — never store raw email/name
  subscriptionId?: string;  // For future MRR calculation (deferred to v11.2)
  metadata: Record<string, string>;
  createdAt: string;        // ISO 8601
}

interface BalanceResult {
  available: Cents;
  pending: Cents;
  currency: 'USD';
}

// ── API Response Shapes (for type-safe access on apiCall results) ─────

/** Shape of Stripe /account response fields we access */
interface StripeAccountResponse {
  id: string;
  business_profile?: { name?: string };
  email?: string;
  default_currency?: string;
  [key: string]: unknown;
}

/** Shape of Stripe /events list response */
interface StripeEventsResponse {
  data: Array<Record<string, unknown>>;
  has_more: boolean;
  [key: string]: unknown;
}

/** Shape of Stripe /balance response */
interface StripeBalanceResponse {
  available: Array<{ currency: string; amount: number }>;
  pending: Array<{ currency: string; amount: number }>;
  [key: string]: unknown;
}

/** Shape of Paddle /businesses response */
interface PaddleBusinessesResponse {
  data: Array<{ id: string; name: string; currency_code: string }>;
  [key: string]: unknown;
}

/** Shape of Paddle /transactions response */
interface PaddleTransactionsResponse {
  data: Array<Record<string, unknown>>;
  meta?: { pagination?: { next?: string } };
  [key: string]: unknown;
}

// ── Reference Implementation: Stripe ──────────────────

class StripeAdapter implements RevenueSourceAdapter {
  private apiKey: string = '';
  private readonly baseUrl = 'https://api.stripe.com/v1';

  async connect(credentials: RevenueCredentials): Promise<ConnectionResult> {
    this.apiKey = credentials.apiKey || '';
    try {
      const account = await this.apiCall('GET', '/account') as StripeAccountResponse;
      return {
        connected: true,
        accountId: account.id,
        accountName: account.business_profile?.name || account.email,
        currency: account.default_currency?.toUpperCase(),
      };
    } catch (err) {
      return { connected: false, error: (err as Error).message };
    }
  }

  async detectCurrency(credentials: RevenueCredentials): Promise<string> {
    const result = await this.connect(credentials);
    return result.currency || 'USD';
  }

  async getTransactions(range: DateRange, cursor?: string): Promise<TransactionPage> {
    // Use Stripe Events API for sequential, immutable event log (§9.18)
    const params: Record<string, string> = {
      type: 'charge.succeeded',
      'created[gte]': String(Math.floor(new Date(range.start).getTime() / 1000)),
      'created[lte]': String(Math.floor(new Date(range.end).getTime() / 1000)),
      limit: '100',
    };
    if (cursor) params.starting_after = cursor;

    const data = await this.apiCall('GET', '/events', params) as StripeEventsResponse;
    const transactions: RevenueTransaction[] = data.data.map((event: Record<string, unknown>) => {
      const charge = (event.data as Record<string, unknown>)?.object as Record<string, unknown>;
      return {
        externalId: event.id as string,
        type: 'charge' as const,
        amount: (charge?.amount as number || 0) as Cents, // Stripe amounts are already in cents
        currency: 'USD' as const,
        description: (charge?.description as string) || '',
        customerId: charge?.customer ? hashCustomerId(charge.customer as string) : undefined,
        subscriptionId: charge?.subscription as string | undefined,
        metadata: (charge?.metadata as Record<string, string>) || {},
        createdAt: new Date((event.created as number) * 1000).toISOString(),
      };
    });

    return {
      transactions,
      hasMore: data.has_more as boolean,
      cursor: data.data.length > 0 ? data.data[data.data.length - 1].id as string : undefined,
    };
  }

  async getBalance(): Promise<BalanceResult> {
    const data = await this.apiCall('GET', '/balance') as StripeBalanceResponse;
    const usd = data.available.find((b) => b.currency === 'usd');
    const pending = data.pending.find((b) => b.currency === 'usd');
    return {
      available: (usd?.amount || 0) as Cents,
      pending: (pending?.amount || 0) as Cents,
      currency: 'USD',
    };
  }

  verifyWebhookSignature(payload: Buffer, signature: string, secret: string): boolean {
    // Stripe uses HMAC-SHA256 for webhook signatures
    const { createHmac } = require('node:crypto');
    const parts = signature.split(',').reduce((acc: Record<string, string>, part: string) => {
      const [key, value] = part.split('=');
      acc[key] = value;
      return acc;
    }, {});

    const timestamp = parts['t'];
    const expected = parts['v1'];
    if (!timestamp || !expected) return false;

    const signed = createHmac('sha256', secret)
      .update(`${timestamp}.${payload.toString()}`)
      .digest('hex');

    // VG-006: Use timing-safe comparison to prevent timing attacks on signature
    const { timingSafeEqual } = require('node:crypto');
    if (signed.length !== expected.length) return false;
    return timingSafeEqual(Buffer.from(signed), Buffer.from(expected));
  }

  private async apiCall(method: string, path: string, params?: Record<string, string>): Promise<Record<string, unknown>> {
    // Implementation: raw HTTPS (no Stripe SDK — zero dependency principle)
    // Headers: Authorization: Bearer {apiKey}, Content-Type: application/x-www-form-urlencoded
    // Sanitize response strings per §9.19.16 before returning
    throw new Error('HTTP implementation — use node:https, no SDK dependencies');
  }
}

// ── Paddle Adapter ────────────────────────────────────

class PaddleAdapter implements RevenueSourceAdapter {
  private apiKey: string = '';
  private readonly baseUrl = 'https://api.paddle.com';

  async connect(credentials: RevenueCredentials): Promise<ConnectionResult> {
    this.apiKey = credentials.apiKey || '';
    try {
      const data = await this.apiCall('GET', '/businesses') as PaddleBusinessesResponse;
      const biz = data.data?.[0];
      return {
        connected: true,
        accountId: biz?.id,
        accountName: biz?.name,
        currency: biz?.currency_code,
      };
    } catch (err) {
      return { connected: false, error: (err as Error).message };
    }
  }

  async detectCurrency(credentials: RevenueCredentials): Promise<string> {
    const result = await this.connect(credentials);
    return result.currency || 'USD';
  }

  async getTransactions(range: DateRange, cursor?: string): Promise<TransactionPage> {
    const params: Record<string, string> = {
      'created_at[gte]': range.start,
      'created_at[lte]': range.end,
      per_page: '100',
    };
    if (cursor) params.after = cursor;

    const data = await this.apiCall('GET', '/transactions', params) as PaddleTransactionsResponse;
    const transactions: RevenueTransaction[] = data.data.map((txn: Record<string, unknown>) => {
      const details = txn.details as Record<string, unknown> | undefined;
      const totals = details?.totals as Record<string, unknown> | undefined;
      const items = txn.items as Array<Record<string, unknown>> | undefined;
      const firstItemPrice = items?.[0]?.price as Record<string, unknown> | undefined;
      return {
        externalId: txn.id as string,
        type: mapPaddleStatus(txn.status as string),
        amount: Math.round(parseFloat(totals?.total as string || '0') * 100) as Cents,
        currency: 'USD' as const,
        description: (firstItemPrice?.description as string) || '',
        customerId: txn.customer_id ? hashCustomerId(txn.customer_id as string) : undefined,
        subscriptionId: txn.subscription_id as string | undefined,
        metadata: (txn.custom_data as Record<string, string>) || {},
        createdAt: txn.created_at as string,
      };
    });

    return {
      transactions,
      hasMore: !!data.meta?.pagination?.next,
      cursor: data.meta?.pagination?.next,
    };
  }

  private async apiCall(method: string, path: string, params?: Record<string, string>): Promise<Record<string, unknown>> {
    throw new Error('HTTP implementation — use node:https, no SDK dependencies');
  }
}

// ── Helpers ───────────────────────────────────────────

function hashCustomerId(customerId: string): string {
  const { createHash } = require('node:crypto');
  return createHash('sha256').update(customerId).digest('hex').substring(0, 16);
}

function mapPaddleStatus(status: string): RevenueTransaction['type'] {
  if (status === 'completed' || status === 'paid') return 'charge';
  if (status === 'refunded' || status === 'partially_refunded') return 'refund';
  if (status === 'disputed') return 'dispute';
  return 'charge';
}

export type { RevenueSourceAdapter, RevenueCredentials, ConnectionResult, TransactionPage, RevenueTransaction, BalanceResult, DateRange };
export { StripeAdapter, PaddleAdapter, hashCustomerId };
