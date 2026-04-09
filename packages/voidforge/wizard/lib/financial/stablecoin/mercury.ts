/**
 * Mercury Bank Adapter — real implementation via node:https (zero new dependencies).
 *
 * Implements RevenueSourceAdapter for Mercury's REST API.
 * Mercury is a bank, not a stablecoin provider — this reads bank balances
 * and transactions for treasury visibility (same pattern as Stripe adapter).
 *
 * Mercury API v1:
 *   Base URL: https://api.mercury.com/api/v1
 *   Auth: Authorization: Bearer {apiKey}
 *
 * PRD Reference: §12.2 (Operating Bank Account)
 * No Stubs Doctrine: every method makes a real API call.
 */

import { request as httpsRequest } from 'node:https';
import type { RevenueSourceAdapter, RevenueCredentials, ConnectionResult, TransactionPage, BalanceResult, DateRange } from '../../revenue-types.js';

const MERCURY_HOST = 'api.mercury.com';

// ── HTTP helper ──────────────────────────────────────

async function mercuryGet(
  path: string,
  apiKey: string,
  params?: Record<string, string>,
): Promise<{ status: number; body: string }> {
  const query = params ? '?' + new URLSearchParams(params).toString() : '';
  return new Promise((resolve, reject) => {
    const req = httpsRequest({
      hostname: MERCURY_HOST,
      path: `/api/v1${path}${query}`,
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Accept': 'application/json',
      },
      timeout: 15000,
    }, (res) => {
      let data = '';
      res.on('data', (chunk: Buffer) => { data += chunk.toString(); });
      res.on('end', () => resolve({ status: res.statusCode ?? 500, body: data }));
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Mercury API timeout')); });
    req.end();
  });
}

// ── Mercury Bank Adapter ─────────────────────────────

export class MercuryBankAdapter implements RevenueSourceAdapter {
  private apiKey: string;
  private accountId: string | undefined;

  constructor(apiKey: string, accountId?: string) {
    this.apiKey = apiKey;
    this.accountId = accountId;
  }

  async connect(_credentials?: RevenueCredentials): Promise<ConnectionResult> {
    try {
      const { status, body } = await mercuryGet('/accounts', this.apiKey);
      if (status === 200) {
        const data = JSON.parse(body) as {
          accounts?: Array<{
            id?: string;
            name?: string;
            accountNumber?: string;
          }>;
        };
        const accounts = data.accounts ?? [];
        if (accounts.length === 0) {
          return { connected: false, error: 'No accounts found' };
        }
        const primary = accounts[0];
        this.accountId = primary.id;
        return {
          connected: true,
          accountId: primary.id,
          accountName: primary.name ?? 'Mercury Account',
          currency: 'USD',
        };
      }
      // VG-R1-005: Wrap error-path JSON.parse
      try {
        const error = JSON.parse(body) as { message?: string; error?: string };
        return { connected: false, error: error.message ?? error.error ?? `HTTP ${status}` };
      } catch {
        return { connected: false, error: `HTTP ${status}` };
      }
    } catch (err: unknown) {
      return { connected: false, error: err instanceof Error ? err.message : 'Connection failed' };
    }
  }

  async detectCurrency(_credentials?: RevenueCredentials): Promise<string> {
    // Mercury is USD-only
    return 'USD';
  }

  async getTransactions(range: DateRange, cursor?: string): Promise<TransactionPage> {
    if (!this.accountId) {
      throw new Error('Mercury: must call connect() before getTransactions()');
    }

    const params: Record<string, string> = {
      start: range.start,
      end: range.end,
      limit: '100',
    };
    if (cursor) params.offset = cursor;

    try {
      const { status, body } = await mercuryGet(
        `/account/${this.accountId}/transactions`,
        this.apiKey,
        params,
      );

      if (status !== 200) {
        // VG-R1-005: Wrap error-path JSON.parse
        let errorMsg = `HTTP ${status}`;
        try {
          const error = JSON.parse(body) as { message?: string };
          errorMsg = error.message ?? errorMsg;
        } catch { /* non-JSON response */ }
        throw new Error(errorMsg);
      }

      const data = JSON.parse(body) as {
        total?: number;
        transactions?: Array<{
          id?: string;
          amount?: number;
          status?: string;
          note?: string;
          counterpartyName?: string;
          createdAt?: string;
          kind?: string;
        }>;
      };

      const txns = data.transactions ?? [];
      const transactions = txns
        .filter(t => t.status === 'sent' || t.status === 'received' || t.status === 'pending')
        .map(t => ({
          externalId: t.id ?? '',
          type: mapMercuryKind(t.kind, t.amount),
          amount: Math.round((t.amount ?? 0) * 100) as TransactionPage['transactions'][0]['amount'],
          currency: 'USD' as const,
          description: t.note ?? t.counterpartyName ?? 'Mercury transaction',
          metadata: {} as Record<string, string>,
          createdAt: t.createdAt ?? new Date().toISOString(),
        }));

      const total = data.total ?? 0;
      const offset = cursor ? parseInt(cursor, 10) : 0;
      const hasMore = offset + txns.length < total;
      const nextCursor = hasMore ? String(offset + txns.length) : undefined;

      return {
        transactions,
        hasMore,
        cursor: nextCursor,
      };
    } catch (err: unknown) {
      throw new Error(`Mercury getTransactions failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  }

  async getBalance(): Promise<BalanceResult> {
    if (!this.accountId) {
      throw new Error('Mercury: must call connect() before getBalance()');
    }

    try {
      const { status, body } = await mercuryGet(
        `/account/${this.accountId}`,
        this.apiKey,
      );

      if (status !== 200) {
        let errorMsg = `HTTP ${status}`;
        try {
          const error = JSON.parse(body) as { message?: string };
          errorMsg = error.message ?? errorMsg;
        } catch { /* non-JSON response */ }
        throw new Error(errorMsg);
      }

      const data = JSON.parse(body) as {
        currentBalance?: number;
        availableBalance?: number;
      };

      const available = Math.round((data.availableBalance ?? data.currentBalance ?? 0) * 100);
      const pending = Math.round(
        ((data.currentBalance ?? 0) - (data.availableBalance ?? data.currentBalance ?? 0)) * 100,
      );

      return {
        available: available as BalanceResult['available'],
        pending: pending as BalanceResult['pending'],
        currency: 'USD',
      };
    } catch (err: unknown) {
      throw new Error(`Mercury getBalance failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  }
}

// ── Helpers ──────────────────────────────────────────

function mapMercuryKind(
  kind: string | undefined,
  amount: number | undefined,
): 'charge' | 'subscription' | 'refund' | 'dispute' {
  // Mercury transaction kinds: externalTransfer, internalTransfer, outgoingPayment, incomingPayment, etc.
  // Map to revenue-source-adapter types based on direction (amount sign)
  if (kind === 'incomingPayment' || (amount !== undefined && amount > 0)) return 'charge';
  if (kind === 'outgoingPayment' || (amount !== undefined && amount < 0)) return 'refund';
  return 'charge';
}
