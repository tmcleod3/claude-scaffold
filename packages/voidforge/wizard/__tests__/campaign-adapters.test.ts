/**
 * Platform campaign adapter tests — mocks node:https to verify API integration logic.
 * Tier 2: Campaign adapter contracts — ensures correct request/response handling
 * for Google Ads, Meta Marketing, and TikTok Marketing APIs.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { IncomingMessage, ClientRequest } from 'node:http';
import { EventEmitter } from 'node:events';
import { toCents } from '../lib/financial/campaign/base.js';
import type { CampaignConfig, Cents } from '../lib/financial/campaign/base.js';
import { randomUUID } from 'node:crypto';

// ── HTTPS mock ──────────────────────────────────────

type RequestCallback = (res: IncomingMessage) => void;

let mockResponseStatus = 200;
let mockResponseBody = '{}';
let lastRequestOptions: Record<string, unknown> | null = null;
let lastRequestBody: string | null = null;

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
  request: (options: unknown, callback: RequestCallback): ClientRequest => {
    lastRequestOptions = options as Record<string, unknown>;
    const req = new EventEmitter() as ClientRequest;
    req.end = vi.fn((..._args: unknown[]) => {
      const res = createFakeResponse();
      callback(res);
      return req;
    });
    req.write = vi.fn((data: string | Buffer) => {
      lastRequestBody = typeof data === 'string' ? data : data.toString();
      return true;
    });
    req.destroy = vi.fn();
    return req;
  },
}));

// ── Dynamic imports (after mock setup) ──────────────

const { GoogleCampaignAdapter } = await import('../lib/financial/campaign/google-campaign.js');
const { MetaCampaignAdapter } = await import('../lib/financial/campaign/meta-campaign.js');
const { TikTokCampaignAdapter } = await import('../lib/financial/campaign/tiktok-campaign.js');

// ── Test Helpers ────────────────────────────────────

function setMockResponse(status: number, body: unknown): void {
  mockResponseStatus = status;
  mockResponseBody = typeof body === 'string' ? body : JSON.stringify(body);
}

function makeCampaignConfig(overrides?: Partial<CampaignConfig>): CampaignConfig {
  return {
    name: 'Test Campaign',
    platform: 'meta',
    objective: 'traffic',
    dailyBudget: toCents(50),
    targeting: { audiences: ['broad'], locations: ['US'] },
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

// ── Google Campaign Adapter ─────────────────────────

describe('GoogleCampaignAdapter', () => {
  let adapter: InstanceType<typeof GoogleCampaignAdapter>;

  beforeEach(() => {
    adapter = new GoogleCampaignAdapter({
      customerId: '1234567890',
      accessToken: 'google-access-token',
      developerToken: 'google-dev-token',
    });
    lastRequestOptions = null;
    lastRequestBody = null;
  });

  it('createCampaign should POST to campaigns:mutate and return CampaignResult', async () => {
    setMockResponse(200, {
      results: [{ resourceName: 'customers/1234567890/campaigns/111222333' }],
    });

    const result = await adapter.createCampaign(makeCampaignConfig({ platform: 'google' }));

    expect(result.externalId).toBe('111222333');
    expect(result.platform).toBe('google');
    expect(result.status).toBe('created');
    expect(result.dashboardUrl).toContain('111222333');
    expect(lastRequestOptions?.hostname).toBe('googleads.googleapis.com');
  });

  it('pauseCampaign should send status PAUSED to mutate endpoint', async () => {
    setMockResponse(200, { results: [{}] });

    await adapter.pauseCampaign('111222333');

    expect(lastRequestBody).toContain('PAUSED');
    expect(lastRequestBody).toContain('111222333');
  });

  it('resumeCampaign should send status ENABLED to mutate endpoint', async () => {
    setMockResponse(200, { results: [{}] });

    await adapter.resumeCampaign('111222333');

    expect(lastRequestBody).toContain('ENABLED');
  });

  it('deleteCampaign should send remove operation', async () => {
    setMockResponse(200, { results: [{}] });

    await adapter.deleteCampaign('111222333');

    expect(lastRequestBody).toContain('remove');
    expect(lastRequestBody).toContain('111222333');
  });

  it('getSpend should query via searchStream and return SpendReport', async () => {
    setMockResponse(200, [{
      results: [
        { campaign: { id: 'c1' }, metrics: { costMicros: '50000000', impressions: '1000', clicks: '50', conversions: '5' } },
        { campaign: { id: 'c2' }, metrics: { costMicros: '30000000', impressions: '800', clicks: '40', conversions: '3' } },
      ],
    }]);

    const report = await adapter.getSpend({ start: '2026-03-01', end: '2026-03-31' });

    expect(report.platform).toBe('google');
    expect(report.campaigns).toHaveLength(2);
    expect(report.totalSpend).toBeGreaterThan(0);
  });

  it('should throw RATE_LIMITED on 429', async () => {
    setMockResponse(429, { error: { message: 'Rate limit exceeded' } });

    await expect(adapter.createCampaign(makeCampaignConfig())).rejects.toMatchObject({
      code: 'RATE_LIMITED',
      retryable: true,
    });
  });

  it('should throw AUTH_EXPIRED on 401', async () => {
    setMockResponse(200, { results: [{ resourceName: 'customers/123/campaigns/456' }] });
    await adapter.createCampaign(makeCampaignConfig()); // prime rate limiter

    setMockResponse(401, { error: { message: 'Token expired' } });
    await expect(adapter.getSpend({ start: '2026-01-01', end: '2026-01-31' })).rejects.toMatchObject({
      code: 'AUTH_EXPIRED',
    });
  });
});

// ── Meta Campaign Adapter ───────────────────────────

describe('MetaCampaignAdapter', () => {
  let adapter: InstanceType<typeof MetaCampaignAdapter>;

  beforeEach(() => {
    adapter = new MetaCampaignAdapter({
      adAccountId: 'act_123456',
      accessToken: 'meta-access-token',
    });
    lastRequestOptions = null;
    lastRequestBody = null;
  });

  it('createCampaign should POST to /act_ID/campaigns and return result', async () => {
    setMockResponse(200, { id: 'meta_campaign_789' });

    const result = await adapter.createCampaign(makeCampaignConfig({ platform: 'meta' }));

    expect(result.externalId).toBe('meta_campaign_789');
    expect(result.platform).toBe('meta');
    expect(result.status).toBe('created');
    expect(result.dashboardUrl).toContain('meta_campaign_789');
    expect(lastRequestOptions?.hostname).toBe('graph.facebook.com');
  });

  it('pauseCampaign should POST status=PAUSED', async () => {
    setMockResponse(200, { success: true });

    await adapter.pauseCampaign('meta_campaign_789');

    expect(lastRequestBody).toContain('PAUSED');
  });

  it('resumeCampaign should POST status=ACTIVE', async () => {
    setMockResponse(200, { success: true });

    await adapter.resumeCampaign('meta_campaign_789');

    expect(lastRequestBody).toContain('ACTIVE');
  });

  it('getSpend should return SpendReport from insights', async () => {
    setMockResponse(200, {
      data: [
        { campaign_id: 'c1', spend: '45.67', impressions: '1500', clicks: '75', conversions: '8' },
        { campaign_id: 'c2', spend: '23.45', impressions: '900', clicks: '45', conversions: '4' },
      ],
    });

    const report = await adapter.getSpend({ start: '2026-03-01', end: '2026-03-31' });

    expect(report.platform).toBe('meta');
    expect(report.campaigns).toHaveLength(2);
    expect(report.totalSpend).toBeGreaterThan(0);
    expect(report.campaigns[0].externalId).toBe('c1');
  });

  it('getPerformance should return PerformanceMetrics', async () => {
    setMockResponse(200, {
      data: [{ impressions: '5000', clicks: '250', conversions: '20', spend: '100.00', ctr: '5.0', cpc: '0.40' }],
    });

    const perf = await adapter.getPerformance('c1');

    expect(perf.campaignId).toBe('c1');
    expect(perf.impressions).toBe(5000);
    expect(perf.clicks).toBe(250);
    expect(perf.spend).toBe(toCents(100));
  });

  it('should throw RATE_LIMITED on Meta error code 4', async () => {
    setMockResponse(400, { error: { message: 'Too many calls', code: 4 } });

    await expect(adapter.getSpend({ start: '2026-01-01', end: '2026-01-31' })).rejects.toMatchObject({
      code: 'RATE_LIMITED',
      retryable: true,
    });
  });
});

// ── TikTok Campaign Adapter ─────────────────────────

describe('TikTokCampaignAdapter', () => {
  let adapter: InstanceType<typeof TikTokCampaignAdapter>;

  beforeEach(() => {
    adapter = new TikTokCampaignAdapter({
      appId: 'adv_tiktok_123',
      accessToken: 'tiktok-access-token',
    });
    lastRequestOptions = null;
    lastRequestBody = null;
  });

  it('createCampaign should POST to /campaign/create/ and return result', async () => {
    setMockResponse(200, {
      code: 0,
      message: 'OK',
      data: { campaign_id: 'tt_campaign_456' },
    });

    const result = await adapter.createCampaign(makeCampaignConfig({ platform: 'tiktok' }));

    expect(result.externalId).toBe('tt_campaign_456');
    expect(result.platform).toBe('tiktok');
    expect(result.status).toBe('created');
    expect(lastRequestOptions?.hostname).toBe('business-api.tiktok.com');
  });

  it('pauseCampaign should POST opt_status=DISABLE', async () => {
    setMockResponse(200, { code: 0, message: 'OK', data: {} });

    await adapter.pauseCampaign('tt_campaign_456');

    expect(lastRequestBody).toContain('DISABLE');
    expect(lastRequestBody).toContain('tt_campaign_456');
  });

  it('resumeCampaign should POST opt_status=ENABLE', async () => {
    setMockResponse(200, { code: 0, message: 'OK', data: {} });

    await adapter.resumeCampaign('tt_campaign_456');

    expect(lastRequestBody).toContain('ENABLE');
  });

  it('getSpend should return SpendReport from reporting API', async () => {
    setMockResponse(200, {
      code: 0,
      message: 'OK',
      data: {
        list: [
          { dimensions: { campaign_id: 'c1' }, metrics: { spend: '75.00', impressions: '2000', clicks: '100', conversion: '10' } },
        ],
      },
    });

    const report = await adapter.getSpend({ start: '2026-03-01', end: '2026-03-31' });

    expect(report.platform).toBe('tiktok');
    expect(report.campaigns).toHaveLength(1);
    expect(report.campaigns[0].externalId).toBe('c1');
    expect(report.totalSpend).toBe(toCents(75));
  });

  it('should throw AUTH_EXPIRED on TikTok error code 40100', async () => {
    setMockResponse(200, { code: 40100, message: 'Access token is invalid' });

    await expect(adapter.createCampaign(makeCampaignConfig())).rejects.toMatchObject({
      code: 'AUTH_EXPIRED',
      platform: 'tiktok',
    });
  });

  it('should throw RATE_LIMITED on TikTok error code 40002', async () => {
    setMockResponse(200, { code: 40002, message: 'Too many requests' });

    await expect(adapter.pauseCampaign('c1')).rejects.toMatchObject({
      code: 'RATE_LIMITED',
      retryable: true,
    });
  });
});
