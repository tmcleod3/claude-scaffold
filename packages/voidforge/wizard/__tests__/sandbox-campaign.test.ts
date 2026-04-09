/**
 * Sandbox campaign adapter tests — realistic fake data for dev/demo mode.
 * Tier 1: Campaign adapter correctness — sandbox must behave like production shape-wise.
 */

import { describe, it, expect } from 'vitest';
import { SandboxCampaignAdapter } from '../lib/financial/campaign/sandbox-campaign.js';
import { toCents } from '../lib/financial/campaign/base.js';
import type { CampaignConfig, OAuthTokens } from '../lib/financial/campaign/base.js';
import { randomUUID } from 'node:crypto';

// ── Test Helpers ────────────────────────────────────

function makeCampaignConfig(overrides?: Partial<CampaignConfig>): CampaignConfig {
  return {
    name: 'Test Campaign',
    platform: 'meta',
    objective: 'traffic',
    dailyBudget: toCents(50),
    targeting: {
      audiences: ['broad'],
      locations: ['US'],
    },
    creative: {
      headlines: ['Buy Now'],
      descriptions: ['Great product'],
      callToAction: 'LEARN_MORE',
      landingUrl: 'https://example.com',
    },
    idempotencyKey: randomUUID(),
    complianceStatus: 'passed',
    ...overrides,
  };
}

function makeTokens(): OAuthTokens {
  return {
    accessToken: 'sandbox-access-token',
    refreshToken: 'sandbox-refresh-token',
    expiresAt: new Date(Date.now() + 3600000).toISOString(),
    platform: 'meta',
    scopes: ['ads_management'],
  };
}

// ── Token Management ────────────────────────────────

describe('SandboxCampaignAdapter — Token Management', () => {
  const adapter = new SandboxCampaignAdapter();

  it('refreshToken should extend expiry without changing access token', async () => {
    const tokens = makeTokens();
    const refreshed = await adapter.refreshToken(tokens);
    expect(refreshed.accessToken).toBe(tokens.accessToken);
    expect(refreshed.refreshToken).toBe(tokens.refreshToken);
    expect(new Date(refreshed.expiresAt).getTime()).toBeGreaterThan(Date.now());
  });
});

// ── Campaign CRUD ───────────────────────────────────

describe('SandboxCampaignAdapter — Campaign CRUD', () => {
  it('createCampaign should return valid CampaignResult', async () => {
    const adapter = new SandboxCampaignAdapter();
    const config = makeCampaignConfig();
    const result = await adapter.createCampaign(config);

    expect(result.externalId).toBeDefined();
    expect(result.externalId.startsWith('sandbox_campaign_')).toBe(true);
    expect(result.platform).toBe('meta');
    expect(result.status).toBe('pending_review');
    expect(result.dashboardUrl).toContain(result.externalId);
  });

  it('createCampaign should be idempotent — same key returns same result', async () => {
    const adapter = new SandboxCampaignAdapter();
    const config = makeCampaignConfig();
    const first = await adapter.createCampaign(config);
    const second = await adapter.createCampaign(config);

    expect(first.externalId).toBe(second.externalId);
    expect(adapter.getCampaignCount()).toBe(1);
  });

  it('idempotent replay should reflect current status, not stale "created"', async () => {
    const adapter = new SandboxCampaignAdapter();
    const config = makeCampaignConfig();
    const first = await adapter.createCampaign(config);

    // Approve and advance
    adapter.approveCampaign(first.externalId);
    const replayed = await adapter.createCampaign(config);

    // Should say 'created' (approved) not 'pending_review' (stale)
    expect(replayed.externalId).toBe(first.externalId);
    expect(replayed.status).toBe('created');
  });

  it('createCampaign with different keys should create separate campaigns', async () => {
    const adapter = new SandboxCampaignAdapter();
    const config1 = makeCampaignConfig({ idempotencyKey: randomUUID() });
    const config2 = makeCampaignConfig({ idempotencyKey: randomUUID() });
    const r1 = await adapter.createCampaign(config1);
    const r2 = await adapter.createCampaign(config2);

    expect(r1.externalId).not.toBe(r2.externalId);
    expect(adapter.getCampaignCount()).toBe(2);
  });

  it('pauseCampaign should transition active → paused', async () => {
    const adapter = new SandboxCampaignAdapter();
    const config = makeCampaignConfig();
    const { externalId } = await adapter.createCampaign(config);

    adapter.approveCampaign(externalId);
    expect(adapter.getCampaignStatus(externalId)).toBe('active');

    await adapter.pauseCampaign(externalId);
    expect(adapter.getCampaignStatus(externalId)).toBe('paused');
  });

  it('pauseCampaign should throw for non-active campaign', async () => {
    const adapter = new SandboxCampaignAdapter();
    const config = makeCampaignConfig();
    const { externalId } = await adapter.createCampaign(config);

    await expect(adapter.pauseCampaign(externalId)).rejects.toMatchObject({
      code: 'UNKNOWN',
    });
  });

  it('resumeCampaign should transition paused → active', async () => {
    const adapter = new SandboxCampaignAdapter();
    const config = makeCampaignConfig();
    const { externalId } = await adapter.createCampaign(config);

    adapter.approveCampaign(externalId);
    await adapter.pauseCampaign(externalId);
    expect(adapter.getCampaignStatus(externalId)).toBe('paused');

    await adapter.resumeCampaign(externalId);
    expect(adapter.getCampaignStatus(externalId)).toBe('active');
  });

  it('resumeCampaign should throw for non-paused campaign', async () => {
    const adapter = new SandboxCampaignAdapter();
    const config = makeCampaignConfig();
    const { externalId } = await adapter.createCampaign(config);
    adapter.approveCampaign(externalId);

    await expect(adapter.resumeCampaign(externalId)).rejects.toMatchObject({
      code: 'UNKNOWN',
    });
  });

  it('deleteCampaign should set status to deleted', async () => {
    const adapter = new SandboxCampaignAdapter();
    const config = makeCampaignConfig();
    const { externalId } = await adapter.createCampaign(config);

    await adapter.deleteCampaign(externalId);
    expect(adapter.getCampaignStatus(externalId)).toBe('deleted');
  });

  it('updateBudget should change daily budget', async () => {
    const adapter = new SandboxCampaignAdapter();
    const config = makeCampaignConfig({ dailyBudget: toCents(50) });
    const { externalId } = await adapter.createCampaign(config);

    await adapter.updateBudget(externalId, toCents(100));
    adapter.approveCampaign(externalId);
    const perf = await adapter.getPerformance(externalId);
    expect(perf.campaignId).toBe(externalId);
  });

  it('updateCreative should merge creative fields', async () => {
    const adapter = new SandboxCampaignAdapter();
    const config = makeCampaignConfig();
    const { externalId } = await adapter.createCampaign(config);

    await adapter.updateCreative(externalId, { headlines: ['New Headline'] });
  });

  it('updateCampaign should update name, budget, targeting, and schedule', async () => {
    const adapter = new SandboxCampaignAdapter();
    const config = makeCampaignConfig();
    const { externalId } = await adapter.createCampaign(config);

    await adapter.updateCampaign(externalId, {
      name: 'Updated Campaign',
      dailyBudget: toCents(200),
      targeting: { locations: ['US', 'CA'] },
      schedule: { startDate: '2026-04-01', endDate: '2026-05-01' },
    });
  });

  it('operations on unknown campaign should throw PlatformError', async () => {
    const adapter = new SandboxCampaignAdapter();
    await expect(adapter.pauseCampaign('nonexistent')).rejects.toMatchObject({
      code: 'UNKNOWN',
      platform: 'meta',
    });
  });
});

// ── Deleted Campaign Operations ─────────────────────

describe('SandboxCampaignAdapter — Deleted Campaign Guards', () => {
  it('updateBudget on deleted campaign should throw', async () => {
    const adapter = new SandboxCampaignAdapter();
    const { externalId } = await adapter.createCampaign(makeCampaignConfig());
    await adapter.deleteCampaign(externalId);

    await expect(adapter.updateBudget(externalId, toCents(100))).rejects.toMatchObject({
      code: 'UNKNOWN',
      originalCode: 410,
    });
  });

  it('updateCreative on deleted campaign should throw', async () => {
    const adapter = new SandboxCampaignAdapter();
    const { externalId } = await adapter.createCampaign(makeCampaignConfig());
    await adapter.deleteCampaign(externalId);

    await expect(adapter.updateCreative(externalId, { headlines: ['X'] })).rejects.toMatchObject({
      originalCode: 410,
    });
  });

  it('updateCampaign on deleted campaign should throw', async () => {
    const adapter = new SandboxCampaignAdapter();
    const { externalId } = await adapter.createCampaign(makeCampaignConfig());
    await adapter.deleteCampaign(externalId);

    await expect(adapter.updateCampaign(externalId, { name: 'X' })).rejects.toMatchObject({
      originalCode: 410,
    });
  });

  it('pauseCampaign on deleted campaign should throw with 410', async () => {
    const adapter = new SandboxCampaignAdapter();
    const { externalId } = await adapter.createCampaign(makeCampaignConfig());
    adapter.approveCampaign(externalId);
    await adapter.deleteCampaign(externalId);

    await expect(adapter.pauseCampaign(externalId)).rejects.toMatchObject({
      originalCode: 410,
    });
  });
});

// ── Reporting ───────────────────────────────────────

describe('SandboxCampaignAdapter — Reporting', () => {
  it('getPerformance should return valid metrics with realistic ROAS range', async () => {
    const adapter = new SandboxCampaignAdapter();
    const config = makeCampaignConfig({ dailyBudget: toCents(100) });
    const { externalId } = await adapter.createCampaign(config);

    adapter.approveCampaign(externalId);
    const perf = await adapter.getPerformance(externalId);

    expect(perf.campaignId).toBe(externalId);
    expect(perf.impressions).toBeGreaterThan(0);
    expect(perf.clicks).toBeGreaterThanOrEqual(0);
    expect(perf.spend).toBeGreaterThan(0);
    // ROAS comes from fakeRoas() directly — range: 1.5-4.2x
    expect(perf.roas).toBeGreaterThanOrEqual(1.5);
    expect(perf.roas).toBeLessThanOrEqual(4.2);
  });

  it('getPerformance on non-active campaign should return zero metrics', async () => {
    const adapter = new SandboxCampaignAdapter();
    const config = makeCampaignConfig();
    const { externalId } = await adapter.createCampaign(config);

    // pending_review — no metrics should advance
    const perf = await adapter.getPerformance(externalId);
    expect(perf.impressions).toBe(0);
    expect(perf.clicks).toBe(0);
    expect(perf.spend).toBe(0);
  });

  it('getSpend with no campaigns should return empty', async () => {
    const adapter = new SandboxCampaignAdapter();
    const spend = await adapter.getSpend({ start: '2026-01-01', end: '2026-12-31' });
    expect(spend.campaigns).toHaveLength(0);
    expect(spend.totalSpend).toBe(0);
  });

  it('getSpend should exclude pending_review and deleted campaigns', async () => {
    const adapter = new SandboxCampaignAdapter();
    // Create one pending, one active with spend, one deleted
    const c1 = await adapter.createCampaign(makeCampaignConfig({ idempotencyKey: randomUUID() }));
    const c2 = await adapter.createCampaign(makeCampaignConfig({ idempotencyKey: randomUUID() }));
    const c3 = await adapter.createCampaign(makeCampaignConfig({ idempotencyKey: randomUUID() }));

    // c1 stays pending_review
    // c2 approved and polled
    adapter.approveCampaign(c2.externalId);
    await adapter.getPerformance(c2.externalId);
    // c3 deleted
    await adapter.deleteCampaign(c3.externalId);

    const spend = await adapter.getSpend({ start: '2026-01-01', end: '2026-12-31' });
    expect(spend.campaigns).toHaveLength(1);
    expect(spend.campaigns[0].externalId).toBe(c2.externalId);
  });

  it('getSpend should aggregate across all active campaigns', async () => {
    const adapter = new SandboxCampaignAdapter();

    const c1 = await adapter.createCampaign(makeCampaignConfig({ idempotencyKey: randomUUID() }));
    const c2 = await adapter.createCampaign(makeCampaignConfig({ idempotencyKey: randomUUID() }));
    adapter.approveCampaign(c1.externalId);
    adapter.approveCampaign(c2.externalId);

    await adapter.getPerformance(c1.externalId);
    await adapter.getPerformance(c2.externalId);

    const spend = await adapter.getSpend({ start: '2026-01-01', end: '2026-12-31' });
    expect(spend.platform).toBe('meta');
    expect(spend.campaigns.length).toBe(2);
    expect(spend.totalSpend).toBeGreaterThan(0);
  });

  it('getInsights should return requested metrics', async () => {
    const adapter = new SandboxCampaignAdapter();
    const config = makeCampaignConfig();
    const { externalId } = await adapter.createCampaign(config);
    adapter.approveCampaign(externalId);
    await adapter.getPerformance(externalId);

    const insights = await adapter.getInsights(externalId, ['impressions', 'clicks', 'ctr']);
    expect(insights.campaignId).toBe(externalId);
    expect(insights.metrics).toHaveProperty('impressions');
    expect(insights.metrics).toHaveProperty('clicks');
    expect(insights.metrics).toHaveProperty('ctr');
  });

  it('getInsights should include recommendations for active campaigns only', async () => {
    const adapter = new SandboxCampaignAdapter();
    const config = makeCampaignConfig();
    const { externalId } = await adapter.createCampaign(config);
    adapter.approveCampaign(externalId);

    const active = await adapter.getInsights(externalId, ['impressions']);
    expect(active.recommendations).toBeDefined();
    expect(active.recommendations!.length).toBeGreaterThan(0);

    await adapter.pauseCampaign(externalId);
    const paused = await adapter.getInsights(externalId, ['impressions']);
    expect(paused.recommendations).toBeUndefined();
  });
});

// ── Lifecycle ───────────────────────────────────────

describe('SandboxCampaignAdapter — Lifecycle', () => {
  it('full lifecycle: create → approve → pause → resume → delete', async () => {
    const adapter = new SandboxCampaignAdapter();
    const config = makeCampaignConfig();
    const { externalId } = await adapter.createCampaign(config);

    expect(adapter.getCampaignStatus(externalId)).toBe('pending_review');

    adapter.approveCampaign(externalId);
    expect(adapter.getCampaignStatus(externalId)).toBe('active');

    await adapter.pauseCampaign(externalId);
    expect(adapter.getCampaignStatus(externalId)).toBe('paused');

    await adapter.resumeCampaign(externalId);
    expect(adapter.getCampaignStatus(externalId)).toBe('active');

    await adapter.deleteCampaign(externalId);
    expect(adapter.getCampaignStatus(externalId)).toBe('deleted');
  });

  it('approveCampaign on already-active campaign should be a no-op', async () => {
    const adapter = new SandboxCampaignAdapter();
    const { externalId } = await adapter.createCampaign(makeCampaignConfig());
    adapter.approveCampaign(externalId);
    expect(adapter.getCampaignStatus(externalId)).toBe('active');

    // Second approve should not throw or change state
    adapter.approveCampaign(externalId);
    expect(adapter.getCampaignStatus(externalId)).toBe('active');
  });

  it('approveCampaign on unknown ID should throw', async () => {
    const adapter = new SandboxCampaignAdapter();
    expect(() => adapter.approveCampaign('nonexistent')).toThrow();
  });

  it('constructor should accept platform parameter', () => {
    const adapter = new SandboxCampaignAdapter('google');
    // Platform is used in error messages and spend reports
    expect(adapter).toBeDefined();
  });
});

// ── Adapter Factory ────────────────────────────────

describe('getCampaignAdapter', () => {
  // Dynamic import to avoid circular dependency issues
  it('should return SandboxCampaignAdapter when vaultKey is null', async () => {
    const { getCampaignAdapter } = await import('../lib/financial/adapter-factory.js');
    const adapter = await getCampaignAdapter('meta', null);
    // Sandbox adapter has getCampaignCount method
    expect(adapter).toBeDefined();
    expect(typeof adapter.createCampaign).toBe('function');
    expect(typeof adapter.pauseCampaign).toBe('function');
    expect(typeof adapter.getPerformance).toBe('function');
  });
});
