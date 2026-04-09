/**
 * TikTok billing adapter tests — mocks node:https to verify API integration logic.
 * Tier 2: Billing adapter contracts — ensures correct parsing of TikTok API responses.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { IncomingMessage, ClientRequest } from 'node:http';
import { EventEmitter } from 'node:events';

// -- HTTPS mock ---------------------------------------------------

type RequestCallback = (res: IncomingMessage) => void;

let mockResponseStatus = 200;
let mockResponseBody = '{}';

/** Create a fake IncomingMessage that emits the configured body. */
function createFakeResponse(): IncomingMessage {
  const res = new EventEmitter() as IncomingMessage;
  res.statusCode = mockResponseStatus;
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
    req.write = vi.fn();
    req.destroy = vi.fn();
    return req;
  },
}));

const { TikTokBillingSetup, TikTokBillingAdapter } = await import(
  '../lib/financial/billing/tiktok-billing.js'
);

// -- Helpers ------------------------------------------------------

function setMockResponse(status: number, body: unknown): void {
  mockResponseStatus = status;
  mockResponseBody = typeof body === 'string' ? body : JSON.stringify(body);
}

// -- Tests --------------------------------------------------------

describe('TikTokBillingSetup', () => {
  let setup: InstanceType<typeof TikTokBillingSetup>;

  beforeEach(() => {
    setup = new TikTokBillingSetup();
  });

  describe('verifyBillingCapability()', () => {
    it('should return MONITORED_ONLY for prepaid billing type', async () => {
      setMockResponse(200, {
        code: 0,
        data: { list: [{ billing_type: 'prepaid', advertiser_id: 'adv_123' }] },
      });

      const result = await setup.verifyBillingCapability('tiktok', 'adv_123', {
        accessToken: 'tok_test',
      });

      expect(result).toBe('MONITORED_ONLY');
    });

    it('should return UNSUPPORTED for unknown billing type', async () => {
      setMockResponse(200, {
        code: 0,
        data: { list: [{ billing_type: 'experimental', advertiser_id: 'adv_456' }] },
      });

      const result = await setup.verifyBillingCapability('tiktok', 'adv_456', {
        accessToken: 'tok_test',
      });

      expect(result).toBe('UNSUPPORTED');
    });
  });
});

describe('TikTokBillingAdapter', () => {
  let adapter: InstanceType<typeof TikTokBillingAdapter>;

  beforeEach(() => {
    adapter = new TikTokBillingAdapter({ appId: 'adv_789', accessToken: 'tok_test' });
  });

  describe('readExpectedDebits()', () => {
    it('should return array with projected amounts from spend velocity', async () => {
      setMockResponse(200, {
        code: 0,
        data: {
          list: [
            { dimensions: { stat_time_day: '2024-04-01' }, metrics: { spend: '100.00' } },
            { dimensions: { stat_time_day: '2024-04-02' }, metrics: { spend: '150.00' } },
          ],
        },
      });

      const debits = await adapter.readExpectedDebits('tiktok', {
        start: '2024-04-01',
        end: '2024-04-03',
      });

      expect(debits).toHaveLength(1);
      expect(debits[0].platform).toBe('tiktok');
      expect(debits[0].externalAccountId).toBe('adv_789');
      expect(debits[0].estimatedAmountCents).toBeGreaterThan(0);
      expect(debits[0].status).toBe('expected');
    });
  });

  describe('normalizeFundingState()', () => {
    it('should return capability + spend data when profile is set', async () => {
      adapter.setProfile({
        platform: 'tiktok',
        capabilityState: 'MONITORED_ONLY',
        billingMode: 'manual_bank_transfer',
        externalAccountId: 'adv_789',
        currency: 'USD',
        status: 'active',
        lastVerifiedAt: new Date().toISOString(),
      });

      const states = await adapter.normalizeFundingState();

      expect(states).toHaveLength(1);
      expect(states[0].platform).toBe('tiktok');
      expect(states[0].capabilityState).toBe('MONITORED_ONLY');
      expect(states[0].fundingHealthy).toBe(true);
      expect(states[0].outstandingCents).toBe(0);
    });

    it('should return empty array when no profile is set', async () => {
      const states = await adapter.normalizeFundingState();
      expect(states).toHaveLength(0);
    });
  });
});
