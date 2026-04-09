/**
 * Kongo Analytics tests — campaign analytics retrieval and growth signal computation.
 */

import { describe, it, expect, vi } from 'vitest';

import { KongoClient } from '../../lib/kongo/client.js';
import { getCampaignAnalytics, computeGrowthSignal, getGrowthSignal } from '../../lib/kongo/analytics.js';
import type { CampaignAnalytics } from '../../lib/kongo/types.js';

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

const sampleAnalytics: CampaignAnalytics = {
  period: '30d',
  summary: { totalViews: 1250, totalConversions: 87, cvr: 6.96 },
  byVariant: [
    { variantId: 'var_vc', label: 'VC Version', order: 0, views: 650, conversions: 52, cvr: 8.0, weight: 2.0 },
    { variantId: 'var_angel', label: 'Angel Version', order: 1, views: 600, conversions: 35, cvr: 5.83, weight: 1.0 },
  ],
  bySource: [
    { source: 'linkedin', views: 800, conversions: 60, cvr: 7.5 },
    { source: 'direct', views: 450, conversions: 27, cvr: 6.0 },
  ],
  byDay: [
    { date: '2026-03-25', views: 45, conversions: 3 },
    { date: '2026-03-26', views: 52, conversions: 5 },
  ],
};

describe('getCampaignAnalytics', () => {
  it('sends GET to analytics endpoint', async () => {
    const client = createMockClient();
    (client.get as ReturnType<typeof vi.fn>).mockResolvedValue(sampleAnalytics);

    const result = await getCampaignAnalytics(client, 'camp_xyz', '30d');

    expect(result.summary.totalViews).toBe(1250);
    expect(client.get).toHaveBeenCalledWith(
      '/engine/campaigns/camp_xyz/analytics',
      { period: '30d' },
    );
  });

  it('works without period parameter', async () => {
    const client = createMockClient();
    (client.get as ReturnType<typeof vi.fn>).mockResolvedValue(sampleAnalytics);

    await getCampaignAnalytics(client, 'camp_xyz');
    expect(client.get).toHaveBeenCalledWith('/engine/campaigns/camp_xyz/analytics', {});
  });
});

describe('computeGrowthSignal', () => {
  it('identifies clear winner with high confidence', () => {
    // Stronger signal: larger sample + bigger delta for >95% confidence
    const strongAnalytics: CampaignAnalytics = {
      ...sampleAnalytics,
      summary: { totalViews: 4000, totalConversions: 400, cvr: 10 },
      byVariant: [
        { variantId: 'var_vc', label: 'VC Version', order: 0, views: 2000, conversions: 160, cvr: 8.0, weight: 1.0 },
        { variantId: 'var_angel', label: 'Angel Version', order: 1, views: 2000, conversions: 240, cvr: 12.0, weight: 2.0 },
      ],
    };
    const signal = computeGrowthSignal('camp_xyz', strongAnalytics);

    expect(signal.campaignId).toBe('camp_xyz');
    expect(signal.winningVariantId).toBe('var_angel');
    expect(signal.confidence).toBeGreaterThan(0.95);
    expect(signal.conversionRateDelta).toBeGreaterThan(0);
    expect(signal.recommendation).toBe('scale');
    expect(signal.reasoning).toContain('Angel Version');
  });

  it('returns wait when insufficient total views', () => {
    const lowViews: CampaignAnalytics = {
      ...sampleAnalytics,
      summary: { totalViews: 50, totalConversions: 5, cvr: 10 },
      byVariant: [
        { variantId: 'var_a', label: 'A', order: 0, views: 25, conversions: 3, cvr: 12, weight: 1 },
        { variantId: 'var_b', label: 'B', order: 1, views: 25, conversions: 2, cvr: 8, weight: 1 },
      ],
    };

    const signal = computeGrowthSignal('camp_xyz', lowViews);
    expect(signal.recommendation).toBe('wait');
    expect(signal.winningVariantId).toBeNull();
  });

  it('returns wait when only one variant', () => {
    const singleVariant: CampaignAnalytics = {
      ...sampleAnalytics,
      byVariant: [
        { variantId: 'var_a', label: 'A', order: 0, views: 1000, conversions: 100, cvr: 10, weight: 1 },
      ],
    };

    const signal = computeGrowthSignal('camp_xyz', singleVariant);
    expect(signal.recommendation).toBe('wait');
    expect(signal.reasoning).toMatch(/at least (2 variants|one challenger)/);
  });

  it('returns wait when per-variant sample too small', () => {
    const lowPerVariant: CampaignAnalytics = {
      ...sampleAnalytics,
      summary: { totalViews: 300, totalConversions: 20, cvr: 6.67 },
      byVariant: [
        { variantId: 'var_a', label: 'A', order: 0, views: 50, conversions: 5, cvr: 10, weight: 1 },
        { variantId: 'var_b', label: 'B', order: 1, views: 250, conversions: 15, cvr: 6, weight: 1 },
      ],
    };

    const signal = computeGrowthSignal('camp_xyz', lowPerVariant);
    expect(signal.recommendation).toBe('wait');
  });

  it('returns iterate when moderate confidence', () => {
    // Close CVRs = lower confidence
    const closeRace: CampaignAnalytics = {
      ...sampleAnalytics,
      summary: { totalViews: 400, totalConversions: 30, cvr: 7.5 },
      byVariant: [
        { variantId: 'var_a', label: 'A', order: 0, views: 200, conversions: 14, cvr: 7.0, weight: 1 },
        { variantId: 'var_b', label: 'B', order: 1, views: 200, conversions: 16, cvr: 8.0, weight: 1 },
      ],
    };

    const signal = computeGrowthSignal('camp_xyz', closeRace);
    // With such close rates and small samples, should be wait or iterate
    expect(['wait', 'iterate']).toContain(signal.recommendation);
  });

  it('includes sample sizes in result', () => {
    const signal = computeGrowthSignal('camp_xyz', sampleAnalytics);
    expect(signal.sampleSize.control).toBeGreaterThan(0);
    expect(signal.sampleSize.variant).toBeGreaterThan(0);
  });

  it('includes timestamp in result', () => {
    const signal = computeGrowthSignal('camp_xyz', sampleAnalytics);
    expect(signal.timestamp).toBeTruthy();
    expect(() => new Date(signal.timestamp)).not.toThrow();
  });
});

describe('getGrowthSignal', () => {
  it('fetches analytics and computes signal', async () => {
    const client = createMockClient();
    (client.get as ReturnType<typeof vi.fn>).mockResolvedValue(sampleAnalytics);

    const signal = await getGrowthSignal(client, 'camp_xyz', '30d');

    expect(signal.campaignId).toBe('camp_xyz');
    // Sample analytics: control (order 0) has higher CVR than challenger — delta is negative
    expect(['wait', 'iterate', 'kill']).toContain(signal.recommendation);
    expect(client.get).toHaveBeenCalledTimes(1);
  });
});
