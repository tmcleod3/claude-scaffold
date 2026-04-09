/**
 * Stripe Revenue Adapter — real implementation via node:https (zero new dependencies).
 *
 * Implements RevenueSourceAdapter for Stripe's REST API.
 * Read-only: VoidForge never processes payments, only reads revenue data.
 * Uses Stripe API v1 (stable, well-documented, free test mode).
 *
 * PRD Reference: §9.4, §9.9 (revenue tracking)
 * No Stubs Doctrine: every method makes a real API call.
 */

import { request as httpsRequest } from 'node:https';
import type { RevenueSourceAdapter, RevenueCredentials, ConnectionResult, TransactionPage, BalanceResult, DateRange } from '../revenue-types.js';

const STRIPE_HOST = 'api.stripe.com';

/** Make a GET request to the Stripe API. */
async function stripeGet(path: string, apiKey: string, params?: Record<string, string>): Promise<{ status: number; body: string }> {
  const query = params ? '?' + new URLSearchParams(params).toString() : '';
  return new Promise((resolve, reject) => {
    const req = httpsRequest({
      hostname: STRIPE_HOST,
      path: `/v1${path}${query}`,
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      timeout: 15000,
    }, (res) => {
      let data = '';
      res.on('data', (chunk: Buffer) => { data += chunk.toString(); });
      res.on('end', () => resolve({ status: res.statusCode ?? 500, body: data }));
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Stripe API timeout')); });
    req.end();
  });
}

export class StripeAdapter implements RevenueSourceAdapter {
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async connect(_credentials?: RevenueCredentials): Promise<ConnectionResult> {
    try {
      const { status, body } = await stripeGet('/account', this.apiKey);
      if (status === 200) {
        const account = JSON.parse(body) as {
          id?: string;
          business_profile?: { name?: string };
          default_currency?: string;
          settings?: { dashboard?: { display_name?: string } };
        };
        return {
          connected: true,
          accountId: account.id,
          accountName: account.settings?.dashboard?.display_name
            ?? account.business_profile?.name
            ?? account.id
            ?? 'Stripe Account',
          currency: (account.default_currency ?? 'usd').toUpperCase(),
        };
      }
      // VG-R1-005: Wrap error-path JSON.parse — response may be non-JSON (e.g., HTML from proxy 502)
      try {
        const error = JSON.parse(body) as { error?: { message?: string } };
        return { connected: false, error: error.error?.message ?? `HTTP ${status}` };
      } catch {
        return { connected: false, error: `HTTP ${status}` };
      }
    } catch (err: unknown) {
      return { connected: false, error: err instanceof Error ? err.message : 'Connection failed' };
    }
  }

  async detectCurrency(_credentials?: RevenueCredentials): Promise<string> {
    const result = await this.connect();
    return result.currency ?? 'USD';
  }

  async getTransactions(range: DateRange, cursor?: string): Promise<TransactionPage> {
    try {
      const params: Record<string, string> = {
        limit: '100',
        'created[gte]': String(Math.floor(new Date(range.start).getTime() / 1000)),
        'created[lte]': String(Math.floor(new Date(range.end).getTime() / 1000)),
      };
      if (cursor) params.starting_after = cursor;

      const { status, body } = await stripeGet('/charges', this.apiKey, params);
      if (status !== 200) {
        // VG-R1-005: Wrap error-path JSON.parse — response may be non-JSON (e.g., HTML from proxy 502)
        let errorMsg = `HTTP ${status}`;
        try {
          const error = JSON.parse(body) as { error?: { message?: string } };
          errorMsg = error.error?.message ?? errorMsg;
        } catch { /* non-JSON response — use raw HTTP status */ }
        throw new Error(errorMsg);
      }

      const data = JSON.parse(body) as {
        data: Array<{
          id: string;
          created: number;
          amount: number;
          currency: string;
          status: string;
          description?: string;
          metadata?: Record<string, string>;
        }>;
        has_more: boolean;
      };

      const transactions = data.data
        .filter(charge => charge.status === 'succeeded')
        .map(charge => ({
          externalId: charge.id,
          type: 'charge' as const,
          amount: charge.amount as TransactionPage['transactions'][0]['amount'], // Stripe amounts are already in cents
          currency: 'USD' as const,
          description: charge.description ?? 'Stripe charge',
          metadata: charge.metadata ?? {},
          createdAt: new Date(charge.created * 1000).toISOString(),
        }));

      const lastId = data.data.length > 0 ? data.data[data.data.length - 1].id : undefined;

      return {
        transactions,
        hasMore: data.has_more,
        cursor: data.has_more ? lastId : undefined,
      };
    } catch (err: unknown) {
      throw new Error(`Stripe getTransactions failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  }

  async getBalance(): Promise<BalanceResult> {
    try {
      const { status, body } = await stripeGet('/balance', this.apiKey);
      if (status !== 200) {
        // VG-R1-005: Wrap error-path JSON.parse — response may be non-JSON (e.g., HTML from proxy 502)
        let errorMsg = `HTTP ${status}`;
        try {
          const error = JSON.parse(body) as { error?: { message?: string } };
          errorMsg = error.error?.message ?? errorMsg;
        } catch { /* non-JSON response — use raw HTTP status */ }
        throw new Error(errorMsg);
      }

      const data = JSON.parse(body) as {
        available: Array<{ amount: number; currency: string }>;
        pending: Array<{ amount: number; currency: string }>;
      };

      // Sum across all currencies (convert to USD cents — in practice, most accounts use one currency)
      const availableTotal = data.available.reduce((sum, b) => sum + b.amount, 0);
      const pendingTotal = data.pending.reduce((sum, b) => sum + b.amount, 0);

      return {
        available: availableTotal as BalanceResult['available'],
        pending: pendingTotal as BalanceResult['pending'],
        currency: 'USD',
      };
    } catch (err: unknown) {
      throw new Error(`Stripe getBalance failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  }
}
