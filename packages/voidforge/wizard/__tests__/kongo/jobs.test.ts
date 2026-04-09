/**
 * Kongo Jobs tests — signal polling, seed push, webhook handling, job registration.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

import { KongoClient } from '../../lib/kongo/client.js';
import type { KongoJobContext, JobScheduler } from '../../lib/kongo/jobs.js';
import { createKongoJobs, registerKongoJobs } from '../../lib/kongo/jobs.js';

// ── Mock Client ──────────────────────────────────────────

function createMockClient() {
  return {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
    getRateLimitStatus: vi.fn().mockReturnValue({ available: 60, total: 60, windowMs: 60_000 }),
  } as unknown as KongoClient;
}

function createMockContext(overrides: Partial<KongoJobContext> = {}): KongoJobContext {
  return {
    client: createMockClient(),
    webhookSecret: 'whsec_test_secret',
    logger: vi.fn(),
    ...overrides,
  };
}

// ── Tests ────────────────────────────────────────────────

describe('signalPoll', () => {
  it('polls growth signal for all published campaigns', async () => {
    const ctx = createMockContext();
    const client = ctx.client as unknown as { get: ReturnType<typeof vi.fn> };

    // First call: batchGetCampaignStatuses → listCampaigns
    client.get.mockResolvedValueOnce({
      items: [
        { campaignId: 'camp_1', name: 'Campaign 1', isPublished: true },
        { campaignId: 'camp_2', name: 'Campaign 2', isPublished: false }, // Not published
        { campaignId: 'camp_3', name: 'Campaign 3', isPublished: true },
      ],
      hasMore: false,
    });

    // Second call: analytics for camp_1
    client.get.mockResolvedValueOnce({
      period: '30d',
      summary: { totalViews: 500, totalConversions: 50, cvr: 10 },
      byVariant: [
        { variantId: 'var_a', label: 'A', order: 0, views: 250, conversions: 20, cvr: 8, weight: 1 },
        { variantId: 'var_b', label: 'B', order: 1, views: 250, conversions: 30, cvr: 12, weight: 1 },
      ],
      bySource: [],
      byDay: [],
    });

    // Third call: analytics for camp_3
    client.get.mockResolvedValueOnce({
      period: '30d',
      summary: { totalViews: 100, totalConversions: 5, cvr: 5 },
      byVariant: [
        { variantId: 'var_c', label: 'C', order: 0, views: 100, conversions: 5, cvr: 5, weight: 1 },
      ],
      bySource: [],
      byDay: [],
    });

    const jobs = createKongoJobs(ctx);
    const result = await jobs.signalPoll();

    expect(result.signals).toHaveLength(2);
    expect(result.polledAt).toBeTruthy();
    // camp_2 should be skipped (not published)
    expect(client.get).toHaveBeenCalledTimes(3); // 1 list + 2 analytics
  });

  it('calls onSignal callback for each signal', async () => {
    const onSignal = vi.fn().mockResolvedValue(undefined);
    const ctx = createMockContext({ onSignal });
    const client = ctx.client as unknown as { get: ReturnType<typeof vi.fn> };

    client.get.mockResolvedValueOnce({
      items: [{ campaignId: 'camp_1', name: 'C1', isPublished: true }],
      hasMore: false,
    });
    client.get.mockResolvedValueOnce({
      period: '30d',
      summary: { totalViews: 300, totalConversions: 20, cvr: 6.67 },
      byVariant: [
        { variantId: 'var_a', label: 'A', order: 0, views: 150, conversions: 8, cvr: 5.3, weight: 1 },
        { variantId: 'var_b', label: 'B', order: 1, views: 150, conversions: 12, cvr: 8, weight: 1 },
      ],
      bySource: [],
      byDay: [],
    });

    const jobs = createKongoJobs(ctx);
    await jobs.signalPoll();

    expect(onSignal).toHaveBeenCalledTimes(1);
    expect(onSignal).toHaveBeenCalledWith(
      expect.objectContaining({ campaignId: 'camp_1' }),
    );
  });

  it('continues polling other campaigns when one fails', async () => {
    const ctx = createMockContext();
    const client = ctx.client as unknown as { get: ReturnType<typeof vi.fn> };

    client.get.mockResolvedValueOnce({
      items: [
        { campaignId: 'camp_ok', name: 'OK', isPublished: true },
        { campaignId: 'camp_bad', name: 'Bad', isPublished: true },
      ],
      hasMore: false,
    });

    // First analytics call succeeds
    client.get.mockResolvedValueOnce({
      period: '30d',
      summary: { totalViews: 300, totalConversions: 20, cvr: 6.67 },
      byVariant: [
        { variantId: 'var_a', label: 'A', order: 0, views: 200, conversions: 12, cvr: 6, weight: 1 },
        { variantId: 'var_b', label: 'B', order: 1, views: 100, conversions: 8, cvr: 8, weight: 1 },
      ],
      bySource: [],
      byDay: [],
    });

    // Second analytics call fails
    client.get.mockRejectedValueOnce(new Error('API error'));

    const jobs = createKongoJobs(ctx);
    const result = await jobs.signalPoll();

    // Should still have 1 signal (the successful one)
    expect(result.signals).toHaveLength(1);
    expect(ctx.logger).toHaveBeenCalledWith(expect.stringContaining('failed'));
  });

  it('handles empty campaign list', async () => {
    const ctx = createMockContext();
    const client = ctx.client as unknown as { get: ReturnType<typeof vi.fn> };

    client.get.mockResolvedValueOnce({ items: [], hasMore: false });

    const jobs = createKongoJobs(ctx);
    const result = await jobs.signalPoll();

    expect(result.signals).toHaveLength(0);
  });
});

describe('seedPush', () => {
  it('returns winning slot values', async () => {
    const ctx = createMockContext();
    const client = ctx.client as unknown as { get: ReturnType<typeof vi.fn> };

    client.get.mockResolvedValueOnce({
      variantId: 'var_winner',
      label: 'VC Version',
      slotValues: { headline: 'Winning Headline', cta_text: 'Buy Now' },
      views: 1000,
      conversions: 100,
      cvr: 10,
    });

    const jobs = createKongoJobs(ctx);
    const result = await jobs.seedPush('camp_abc', 'var_winner');

    expect(result).toEqual({ headline: 'Winning Headline', cta_text: 'Buy Now' });
    expect(ctx.logger).toHaveBeenCalledWith(expect.stringContaining('seed push'));
    expect(ctx.logger).toHaveBeenCalledWith(expect.stringContaining('2 slot values'));
  });

  it('returns null when variant has no slot values', async () => {
    const ctx = createMockContext();
    const client = ctx.client as unknown as { get: ReturnType<typeof vi.fn> };

    client.get.mockResolvedValueOnce({
      variantId: 'var_empty',
      label: 'Empty',
      views: 0,
      conversions: 0,
      cvr: 0,
    });

    const jobs = createKongoJobs(ctx);
    const result = await jobs.seedPush('camp_abc', 'var_empty');

    expect(result).toBeNull();
    expect(ctx.logger).toHaveBeenCalledWith(expect.stringContaining('no slot values'));
  });
});

describe('webhookHandle', () => {
  it('rejects when no webhook secret configured', async () => {
    const ctx = createMockContext({ webhookSecret: null });
    const jobs = createKongoJobs(ctx);

    await expect(
      jobs.webhookHandle('{}', 'sig'),
    ).rejects.toThrow('signing secret not configured');
  });
});

describe('registerKongoJobs', () => {
  it('registers kongo-signal job at 1-hour interval', () => {
    const scheduler: JobScheduler = { add: vi.fn() };
    const ctx = createMockContext();
    const jobs = createKongoJobs(ctx);

    registerKongoJobs(scheduler, jobs);

    expect(scheduler.add).toHaveBeenCalledWith(
      'kongo-signal',
      3_600_000,
      expect.any(Function),
    );
  });
});
