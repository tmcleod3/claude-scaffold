/**
 * Sandbox adapter tests — ad platform + bank adapters return valid shapes.
 * Tier 2: Adapter contracts — sandbox drives the full Cultivation demo pipeline.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { SandboxSetup, SandboxAdapter } from '../lib/adapters/sandbox.js';
import { SandboxBankAdapter } from '../lib/adapters/sandbox-bank.js';

// ── SandboxSetup ──────────────────────────────────────

describe('SandboxSetup', () => {
  const setup = new SandboxSetup('Test Sandbox');

  it('should authenticate and return valid OAuthTokens', async () => {
    const tokens = await setup.authenticate();
    expect(tokens.accessToken).toBeDefined();
    expect(tokens.accessToken.length).toBeGreaterThan(0);
    expect(tokens.refreshToken).toBeDefined();
    expect(tokens.refreshToken.length).toBeGreaterThan(0);
    expect(tokens.expiresAt).toBeDefined();
    // Token should expire in the future
    expect(new Date(tokens.expiresAt).getTime()).toBeGreaterThan(Date.now());
  });

  it('should verify connection and return valid status', async () => {
    const tokens = await setup.authenticate();
    const status = await setup.verifyConnection(tokens);
    expect(status.connected).toBe(true);
    expect(status.accountName).toContain('Test Sandbox');
    expect(status.accountId).toBeDefined();
    expect(status.currency).toBe('USD');
  });

  it('should detect currency as USD', async () => {
    const tokens = await setup.authenticate();
    const currency = await setup.detectCurrency(tokens);
    expect(currency).toBe('USD');
  });
});

// ── SandboxAdapter ────────────────────────────────────

describe('SandboxAdapter', () => {
  let adapter: SandboxAdapter;
  let campaignId: string;

  beforeAll(async () => {
    adapter = new SandboxAdapter('sandbox-test');
  });

  it('should refresh tokens and return valid shape', async () => {
    const original = { accessToken: 'old', refreshToken: 'old-ref', expiresAt: '2020-01-01', platform: 'meta' as const, scopes: ['ads_read'] };
    const refreshed = await adapter.refreshToken(original);
    expect(refreshed.accessToken).not.toBe('old');
    expect(refreshed.refreshToken).toBe('old-ref'); // refresh token preserved
    expect(new Date(refreshed.expiresAt).getTime()).toBeGreaterThan(Date.now());
  });

  it('should create a campaign and return valid CampaignResult', async () => {
    const result = await adapter.createCampaign({
      name: 'Test Campaign',
      platform: 'meta' as never, // type coercion for test
      objective: 'conversions' as never,
      dailyBudgetCents: 5000,
      targeting: { audiences: [], locations: ['US'] },
    } as never);

    expect(result.externalId).toBeDefined();
    expect(result.externalId).toContain('sandbox_camp_');
    expect(result.status).toBe('created');
    expect(result.platform).toBeDefined();
    expect(result.dashboardUrl).toBeDefined();

    campaignId = result.externalId;
  });

  it('should return valid SpendReport shape', async () => {
    // Create and activate a campaign first
    const result = await adapter.createCampaign({
      name: 'Spend Test',
      dailyBudgetCents: 2000,
    } as never);
    await adapter.resumeCampaign(result.externalId);

    const spend = await adapter.getSpend({
      start: '2026-03-01',
      end: '2026-03-20',
    });

    expect(spend.platform).toBeDefined();
    expect(spend.dateRange).toBeDefined();
    expect(spend.dateRange.start).toBe('2026-03-01');
    expect(spend.dateRange.end).toBe('2026-03-20');
    expect(typeof spend.totalSpend).toBe('number');
    expect(Array.isArray(spend.campaigns)).toBe(true);

    // At least one campaign should have spend (the active one)
    if (spend.campaigns.length > 0) {
      const camp = spend.campaigns[0];
      expect(camp.externalId).toBeDefined();
      expect(typeof camp.spend).toBe('number');
      expect(typeof camp.impressions).toBe('number');
      expect(typeof camp.clicks).toBe('number');
      expect(typeof camp.conversions).toBe('number');
    }
  });

  it('should return valid PerformanceMetrics shape', async () => {
    const perf = await adapter.getPerformance(campaignId || 'any-id');

    expect(typeof perf.campaignId).toBe('string');
    expect(typeof perf.impressions).toBe('number');
    expect(typeof perf.clicks).toBe('number');
    expect(typeof perf.conversions).toBe('number');
    expect(typeof perf.spend).toBe('number');
    expect(typeof perf.ctr).toBe('number');
    expect(typeof perf.cpc).toBe('number');
    expect(typeof perf.roas).toBe('number');

    // CTR should be a ratio between 0 and 1
    expect(perf.ctr).toBeGreaterThanOrEqual(0);
    expect(perf.ctr).toBeLessThanOrEqual(1);
  });

  it('should pause and resume campaigns', async () => {
    const result = await adapter.createCampaign({ name: 'Lifecycle Test', dailyBudgetCents: 1000 } as never);
    // Start paused (default from createCampaign)
    await adapter.resumeCampaign(result.externalId);
    // Should not throw
    await adapter.pauseCampaign(result.externalId);
    // Should not throw
  });

  it('should delete campaigns without error', async () => {
    const result = await adapter.createCampaign({ name: 'Delete Test', dailyBudgetCents: 1000 } as never);
    await expect(adapter.deleteCampaign(result.externalId)).resolves.not.toThrow();
  });

  it('should update budget without error', async () => {
    const result = await adapter.createCampaign({ name: 'Budget Test', dailyBudgetCents: 1000 } as never);
    await expect(adapter.updateBudget(result.externalId, 3000 as never)).resolves.not.toThrow();
  });

  it('should return valid InsightData shape', async () => {
    const result = await adapter.createCampaign({ name: 'Insight Test', dailyBudgetCents: 1000 } as never);
    const insights = await adapter.getInsights(result.externalId, ['impressions', 'clicks', 'ctr']);

    expect(insights.campaignId).toBe(result.externalId);
    expect(insights.metrics).toBeDefined();
    expect(typeof insights.metrics).toBe('object');
  });
});

// ── SandboxBankAdapter ────────────────────────────────

describe('SandboxBankAdapter', () => {
  const bank = new SandboxBankAdapter('Test Bank', 100000);

  it('should connect and return valid ConnectionResult', async () => {
    const result = await bank.connect({ source: 'stripe' });
    expect(result.connected).toBe(true);
    expect(result.accountName).toBe('Test Bank');
    expect(result.accountId).toBeDefined();
    expect(result.accountId!.startsWith('sandbox_bank_')).toBe(true);
    expect(result.currency).toBe('USD');
  });

  it('should connect with default name when no accountName given', async () => {
    const bank2 = new SandboxBankAdapter('Fallback Bank');
    const result = await bank2.connect({ source: 'stripe' });
    expect(result.connected).toBe(true);
    expect(result.accountName).toBe('Fallback Bank');
  });

  it('should return transactions with valid shape', async () => {
    const page = await bank.getTransactions({
      start: '2026-03-01',
      end: '2026-03-07',
    });

    expect(Array.isArray(page.transactions)).toBe(true);
    expect(page.transactions.length).toBeGreaterThan(0);
    expect(typeof page.hasMore).toBe('boolean');

    const txn = page.transactions[0];
    expect(txn.externalId).toBeDefined();
    expect(txn.createdAt).toBeDefined();
    expect(typeof txn.amount).toBe('number');
    expect(['charge', 'subscription', 'refund', 'dispute']).toContain(txn.type);
    expect(txn.description).toBeDefined();
    expect(txn.currency).toBe('USD');
  });

  it('should generate both credits and debits', async () => {
    // Use a wide date range to get enough transactions for statistical likelihood
    const page = await bank.getTransactions({
      start: '2026-03-01',
      end: '2026-03-31',
    });

    const hasCharge = page.transactions.some(t => t.type === 'charge');
    const hasRefund = page.transactions.some(t => t.type === 'refund');
    // With 30 days * 2-5 txns/day and 60/40 split, both types should appear
    expect(hasCharge).toBe(true);
    expect(hasRefund).toBe(true);
  });

  it('should return valid balance shape', async () => {
    const balance = await bank.getBalance();
    expect(typeof balance.available).toBe('number');
    expect(typeof balance.pending).toBe('number');
    expect(balance.currency).toBe('USD');
  });

  it('should detect currency as USD', async () => {
    const currency = await bank.detectCurrency({ source: 'stripe' });
    expect(currency).toBe('USD');
  });
});
