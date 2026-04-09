/**
 * Stripe adapter tests — mocks node:https to verify API integration logic.
 * Tier 2: Revenue adapter contracts — ensures correct parsing of Stripe API responses.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { IncomingMessage, ClientRequest } from 'node:http';
import { EventEmitter } from 'node:events';

// ── HTTPS mock ────────────────────────────────────────

type RequestCallback = (res: IncomingMessage) => void;

let mockResponseStatus = 200;
let mockResponseBody = '{}';

/** Create a fake IncomingMessage that emits the configured body. */
function createFakeResponse(): IncomingMessage {
  const res = new EventEmitter() as IncomingMessage;
  res.statusCode = mockResponseStatus;
  // Emit body asynchronously so listeners can attach
  process.nextTick(() => {
    res.emit('data', Buffer.from(mockResponseBody));
    res.emit('end');
  });
  return res;
}

vi.mock('node:https', () => ({
  request: (_options: unknown, callback: RequestCallback): ClientRequest => {
    const req = new EventEmitter() as ClientRequest;
    req.end = vi.fn((..._args: unknown[]) => {
      const res = createFakeResponse();
      callback(res);
      return req;
    });
    req.destroy = vi.fn();
    return req;
  },
}));

const { StripeAdapter } = await import('../lib/adapters/stripe.js');

// ── Helpers ───────────────────────────────────────────

function setMockResponse(status: number, body: unknown): void {
  mockResponseStatus = status;
  mockResponseBody = typeof body === 'string' ? body : JSON.stringify(body);
}

// ── Tests ─────────────────────────────────────────────

describe('StripeAdapter', () => {
  let adapter: InstanceType<typeof StripeAdapter>;

  beforeEach(() => {
    adapter = new StripeAdapter('sk_test_mock_key');
  });

  // ── connect() ─────────────────────────────────────

  describe('connect()', () => {
    it('should return connected: true with account name on valid response', async () => {
      setMockResponse(200, {
        id: 'acct_123',
        business_profile: { name: 'Acme Corp' },
        default_currency: 'usd',
        settings: { dashboard: { display_name: 'Acme Dashboard' } },
      });

      const result = await adapter.connect();

      expect(result.connected).toBe(true);
      expect(result.accountId).toBe('acct_123');
      // display_name takes precedence over business_profile.name
      expect(result.accountName).toBe('Acme Dashboard');
      expect(result.currency).toBe('USD');
    });

    it('should return connected: false with error on 401 response', async () => {
      setMockResponse(401, {
        error: { message: 'Invalid API Key provided' },
      });

      const result = await adapter.connect();

      expect(result.connected).toBe(false);
      expect(result.error).toBe('Invalid API Key provided');
    });

    it('should return connected: false with "HTTP 502" on non-JSON error response', async () => {
      setMockResponse(502, '<html><body>Bad Gateway</body></html>');

      const result = await adapter.connect();

      expect(result.connected).toBe(false);
      expect(result.error).toBe('HTTP 502');
    });
  });

  // ── getTransactions() ─────────────────────────────

  describe('getTransactions()', () => {
    it('should return transaction array with correct shape on valid charges response', async () => {
      setMockResponse(200, {
        data: [
          {
            id: 'ch_abc',
            created: 1711929600, // 2024-04-01T00:00:00Z
            amount: 2500,
            currency: 'usd',
            status: 'succeeded',
            description: 'Test charge',
            metadata: { order: '123' },
          },
          {
            id: 'ch_def',
            created: 1711933200,
            amount: 1000,
            currency: 'usd',
            status: 'succeeded',
            description: null,
            metadata: {},
          },
        ],
        has_more: true,
      });

      const page = await adapter.getTransactions({
        start: '2024-04-01',
        end: '2024-04-30',
      });

      expect(page.transactions).toHaveLength(2);
      expect(page.hasMore).toBe(true);
      expect(page.cursor).toBe('ch_def');

      const txn = page.transactions[0];
      expect(txn.externalId).toBe('ch_abc');
      expect(txn.type).toBe('charge');
      expect(txn.amount).toBe(2500);
      expect(txn.currency).toBe('USD');
      expect(txn.description).toBe('Test charge');
      expect(txn.metadata).toEqual({ order: '123' });
      expect(txn.createdAt).toBeDefined();
    });

    it('should return empty array and hasMore: false on empty data', async () => {
      setMockResponse(200, {
        data: [],
        has_more: false,
      });

      const page = await adapter.getTransactions({
        start: '2024-04-01',
        end: '2024-04-30',
      });

      expect(page.transactions).toHaveLength(0);
      expect(page.hasMore).toBe(false);
      expect(page.cursor).toBeUndefined();
    });

    it('should filter out non-succeeded charges', async () => {
      setMockResponse(200, {
        data: [
          { id: 'ch_1', created: 1711929600, amount: 500, currency: 'usd', status: 'succeeded', description: 'ok' },
          { id: 'ch_2', created: 1711929600, amount: 500, currency: 'usd', status: 'failed', description: 'nope' },
          { id: 'ch_3', created: 1711929600, amount: 500, currency: 'usd', status: 'pending', description: 'waiting' },
        ],
        has_more: false,
      });

      const page = await adapter.getTransactions({
        start: '2024-04-01',
        end: '2024-04-30',
      });

      expect(page.transactions).toHaveLength(1);
      expect(page.transactions[0].externalId).toBe('ch_1');
    });
  });

  // ── getBalance() ──────────────────────────────────

  describe('getBalance()', () => {
    it('should return available + pending totals on valid response', async () => {
      setMockResponse(200, {
        available: [
          { amount: 10000, currency: 'usd' },
          { amount: 5000, currency: 'eur' },
        ],
        pending: [
          { amount: 2500, currency: 'usd' },
        ],
      });

      const balance = await adapter.getBalance();

      // Sums across all currencies
      expect(balance.available).toBe(15000);
      expect(balance.pending).toBe(2500);
      expect(balance.currency).toBe('USD');
    });
  });

  // ── detectCurrency() ──────────────────────────────

  describe('detectCurrency()', () => {
    it('should return uppercase currency from account', async () => {
      setMockResponse(200, {
        id: 'acct_xyz',
        default_currency: 'gbp',
        settings: { dashboard: { display_name: 'UK Shop' } },
      });

      const currency = await adapter.detectCurrency();

      expect(currency).toBe('GBP');
    });

    it('should default to USD when no currency in account', async () => {
      setMockResponse(200, {
        id: 'acct_xyz',
        settings: { dashboard: { display_name: 'No Currency' } },
      });

      const currency = await adapter.detectCurrency();

      expect(currency).toBe('USD');
    });
  });
});
