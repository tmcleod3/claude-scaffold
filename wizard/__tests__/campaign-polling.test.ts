/**
 * Campaign status polling tests — validates the scheduled job that enriches
 * campaign records with live platform metrics for the Danger Room.
 *
 * Tests the polling integration: adapter.getPerformance() → enriched record.
 *
 * Tier 2: Integration correctness — ensures live metrics flow from adapters to dashboard.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { IncomingMessage, ClientRequest } from 'node:http';
import { EventEmitter } from 'node:events';
import { toCents } from '../lib/financial/campaign/base.js';
import type { PerformanceMetrics, SpendReport, Cents, Percentage, Ratio } from '../lib/financial/campaign/base.js';
import { randomUUID } from 'node:crypto';

// ── Mock node:https ─────────────────────────────────

let mockResponseStatus = 200;
let mockResponseBody = '{}';

function createFakeResponse(): IncomingMessage {
  const res = new EventEmitter() as IncomingMessage;
  res.statusCode = mockResponseStatus;
  process.nextTick(() => {
    res.emit('data', Buffer.from(mockResponseBody));
    res.emit('end');
  });
  return res;
}

type RequestCallback = (res: IncomingMessage) => void;

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

const { SandboxCampaignAdapter } = await import('../lib/financial/campaign/sandbox-campaign.js');
const { getCampaignAdapter } = await import('../lib/financial/adapter-factory.js');

// ── Tests ───────────────────────────────────────────

describe('Campaign Status Polling — Adapter Integration', () => {
  it('sandbox adapter enriches campaign with live performance metrics', async () => {
    const adapter = new SandboxCampaignAdapter();
    const result = await adapter.createCampaign({
      name: 'Polling Test',
      platform: 'meta',
      objective: 'traffic',
      dailyBudget: toCents(50),
      targeting: { audiences: ['broad'], locations: ['US'] },
      creative: { headlines: ['H1'], descriptions: ['D1'], callToAction: 'BUY', landingUrl: 'https://test.com' },
      idempotencyKey: randomUUID(),
      complianceStatus: 'passed',
    });

    adapter.approveCampaign(result.externalId);

    // Simulate the polling job: call getPerformance and check metrics
    const perf = await adapter.getPerformance(result.externalId);

    expect(perf.campaignId).toBe(result.externalId);
    expect(perf.impressions).toBeGreaterThan(0);
    expect(perf.spend).toBeGreaterThan(0);
    expect(typeof perf.ctr).toBe('number');
    expect(typeof perf.cpc).toBe('number');
    expect(perf.roas).toBeGreaterThanOrEqual(1.5);
    expect(perf.roas).toBeLessThanOrEqual(4.2);
  });

  it('getSpend aggregates across multiple campaigns for Danger Room dashboard', async () => {
    const adapter = new SandboxCampaignAdapter();

    // Create 3 campaigns
    const ids: string[] = [];
    for (let i = 0; i < 3; i++) {
      const result = await adapter.createCampaign({
        name: `Campaign ${i}`,
        platform: 'meta',
        objective: 'traffic',
        dailyBudget: toCents(50 + i * 25),
        targeting: { audiences: ['broad'], locations: ['US'] },
        creative: { headlines: ['H'], descriptions: ['D'], callToAction: 'BUY', landingUrl: 'https://test.com' },
        idempotencyKey: randomUUID(),
        complianceStatus: 'passed',
      });
      adapter.approveCampaign(result.externalId);
      ids.push(result.externalId);
    }

    // Poll each campaign to generate metrics
    for (const id of ids) {
      await adapter.getPerformance(id);
    }

    // Aggregate spend report
    const spend = await adapter.getSpend({ start: '2026-01-01', end: '2026-12-31' });
    expect(spend.campaigns).toHaveLength(3);
    expect(spend.totalSpend).toBeGreaterThan(0);

    // Each campaign should have spend
    for (const campaign of spend.campaigns) {
      expect(campaign.spend).toBeGreaterThan(0);
      expect(campaign.impressions).toBeGreaterThan(0);
    }
  });

  it('polling non-active campaign returns zero metrics without side effects', async () => {
    const adapter = new SandboxCampaignAdapter();
    const result = await adapter.createCampaign({
      name: 'Pending Campaign',
      platform: 'meta',
      objective: 'traffic',
      dailyBudget: toCents(50),
      targeting: { audiences: ['broad'], locations: ['US'] },
      creative: { headlines: ['H'], descriptions: ['D'], callToAction: 'BUY', landingUrl: 'https://test.com' },
      idempotencyKey: randomUUID(),
      complianceStatus: 'passed',
    });

    // Do NOT approve — campaign is pending_review
    const perf = await adapter.getPerformance(result.externalId);
    expect(perf.impressions).toBe(0);
    expect(perf.spend).toBe(0);
    expect(perf.clicks).toBe(0);
  });

  it('paused campaign retains metrics but does not accumulate new ones', async () => {
    const adapter = new SandboxCampaignAdapter();
    const result = await adapter.createCampaign({
      name: 'Pause Test',
      platform: 'meta',
      objective: 'traffic',
      dailyBudget: toCents(100),
      targeting: { audiences: ['broad'], locations: ['US'] },
      creative: { headlines: ['H'], descriptions: ['D'], callToAction: 'BUY', landingUrl: 'https://test.com' },
      idempotencyKey: randomUUID(),
      complianceStatus: 'passed',
    });

    adapter.approveCampaign(result.externalId);

    // Generate initial metrics
    const active = await adapter.getPerformance(result.externalId);
    const initialSpend = active.spend;
    expect(initialSpend).toBeGreaterThan(0);

    // Pause
    await adapter.pauseCampaign(result.externalId);

    // Poll again — metrics should not increase
    const paused = await adapter.getPerformance(result.externalId);
    expect(paused.spend).toBe(initialSpend);
    expect(paused.impressions).toBe(active.impressions);
  });

  it('factory fallback provides working adapter for unknown platforms', async () => {
    const adapter = await getCampaignAdapter('linkedin' as never, null);
    // Should return sandbox adapter
    expect(typeof adapter.createCampaign).toBe('function');
    expect(typeof adapter.getPerformance).toBe('function');
  });

  it('adapter handles multiple sequential polls without corruption', async () => {
    const adapter = new SandboxCampaignAdapter();
    const result = await adapter.createCampaign({
      name: 'Sequential Poll',
      platform: 'meta',
      objective: 'traffic',
      dailyBudget: toCents(50),
      targeting: { audiences: ['broad'], locations: ['US'] },
      creative: { headlines: ['H'], descriptions: ['D'], callToAction: 'BUY', landingUrl: 'https://test.com' },
      idempotencyKey: randomUUID(),
      complianceStatus: 'passed',
    });

    adapter.approveCampaign(result.externalId);

    // Poll 5 times — spend should increase each time
    let previousSpend = 0;
    for (let i = 0; i < 5; i++) {
      const perf = await adapter.getPerformance(result.externalId);
      expect(perf.spend).toBeGreaterThan(previousSpend);
      previousSpend = perf.spend;
    }
  });

  it('getInsights returns campaign recommendations for Danger Room', async () => {
    const adapter = new SandboxCampaignAdapter();
    const result = await adapter.createCampaign({
      name: 'Insights Test',
      platform: 'meta',
      objective: 'traffic',
      dailyBudget: toCents(50),
      targeting: { audiences: ['broad'], locations: ['US'] },
      creative: { headlines: ['H'], descriptions: ['D'], callToAction: 'BUY', landingUrl: 'https://test.com' },
      idempotencyKey: randomUUID(),
      complianceStatus: 'passed',
    });

    adapter.approveCampaign(result.externalId);
    await adapter.getPerformance(result.externalId);

    const insights = await adapter.getInsights(result.externalId, ['impressions', 'clicks', 'spend']);
    expect(insights.recommendations).toBeDefined();
    expect(insights.metrics.impressions).toBeGreaterThan(0);
  });
});
