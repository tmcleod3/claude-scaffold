/**
 * Kongo Campaigns tests — CRUD, publish/unpublish, batch status.
 */

import { describe, it, expect, vi } from 'vitest';

import { KongoClient } from '../../lib/kongo/client.js';
import {
  createCampaign,
  getCampaign,
  listCampaigns,
  updateCampaign,
  deleteCampaign,
  publishCampaign,
  unpublishCampaign,
  batchGetCampaignStatuses,
} from '../../lib/kongo/campaigns.js';
import type { CampaignDetail, PublishResult, PaginatedResponse } from '../../lib/kongo/types.js';

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

const sampleCampaign: CampaignDetail = {
  campaignId: 'camp_abc123',
  name: 'Series A Outreach',
  templateId: 'pg_tmpl456',
  slug: 'acme-series-a',
  rotationStrategy: 'weighted',
  isPublished: false,
  trackingEnabled: true,
  createdAt: '2026-04-01T12:00:00.000Z',
};

describe('createCampaign', () => {
  it('sends POST to /engine/campaigns', async () => {
    const client = createMockClient();
    (client.post as ReturnType<typeof vi.fn>).mockResolvedValue(sampleCampaign);

    const result = await createCampaign(client, {
      name: 'Series A Outreach',
      templateId: 'pg_tmpl456',
      slug: 'acme-series-a',
      rotationStrategy: 'weighted',
    });

    expect(result.campaignId).toBe('camp_abc123');
    expect(client.post).toHaveBeenCalledWith('/engine/campaigns', {
      name: 'Series A Outreach',
      templateId: 'pg_tmpl456',
      slug: 'acme-series-a',
      rotationStrategy: 'weighted',
    });
  });
});

describe('getCampaign', () => {
  it('sends GET to /engine/campaigns/:campaignId', async () => {
    const client = createMockClient();
    (client.get as ReturnType<typeof vi.fn>).mockResolvedValue(sampleCampaign);

    const result = await getCampaign(client, 'camp_abc123');
    expect(result.name).toBe('Series A Outreach');
    expect(client.get).toHaveBeenCalledWith('/engine/campaigns/camp_abc123');
  });
});

describe('listCampaigns', () => {
  it('sends GET with query params', async () => {
    const client = createMockClient();
    (client.get as ReturnType<typeof vi.fn>).mockResolvedValue({
      items: [sampleCampaign],
      hasMore: false,
    });

    await listCampaigns(client, { published: true, search: 'Series', limit: 10 });

    expect(client.get).toHaveBeenCalledWith('/engine/campaigns', {
      published: true,
      search: 'Series',
      limit: 10,
    });
  });

  it('works with no options', async () => {
    const client = createMockClient();
    (client.get as ReturnType<typeof vi.fn>).mockResolvedValue({ items: [], hasMore: false });

    await listCampaigns(client);
    expect(client.get).toHaveBeenCalledWith('/engine/campaigns', {});
  });
});

describe('updateCampaign', () => {
  it('sends PUT with updates', async () => {
    const client = createMockClient();
    (client.put as ReturnType<typeof vi.fn>).mockResolvedValue({ ...sampleCampaign, rotationStrategy: 'bandit' });

    const result = await updateCampaign(client, 'camp_abc123', { rotationStrategy: 'bandit' });

    expect(result.rotationStrategy).toBe('bandit');
    expect(client.put).toHaveBeenCalledWith(
      '/engine/campaigns/camp_abc123',
      { rotationStrategy: 'bandit' },
    );
  });
});

describe('deleteCampaign', () => {
  it('sends DELETE to /engine/campaigns/:campaignId', async () => {
    const client = createMockClient();
    (client.delete as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

    await deleteCampaign(client, 'camp_abc123');
    expect(client.delete).toHaveBeenCalledWith('/engine/campaigns/camp_abc123');
  });
});

describe('publishCampaign', () => {
  it('sends POST to publish endpoint', async () => {
    const client = createMockClient();
    const publishResult: PublishResult = {
      campaignId: 'camp_abc123',
      slug: 'acme-series-a',
      domain: 'acme-series-a.kongo.io',
      publishedAt: '2026-04-01T14:00:00.000Z',
    };
    (client.post as ReturnType<typeof vi.fn>).mockResolvedValue(publishResult);

    const result = await publishCampaign(client, 'camp_abc123');

    expect(result.domain).toBe('acme-series-a.kongo.io');
    expect(client.post).toHaveBeenCalledWith('/engine/campaigns/camp_abc123/publish');
  });
});

describe('unpublishCampaign', () => {
  it('sends DELETE to publish endpoint', async () => {
    const client = createMockClient();
    (client.delete as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

    await unpublishCampaign(client, 'camp_abc123');
    expect(client.delete).toHaveBeenCalledWith('/engine/campaigns/camp_abc123/publish');
  });
});

describe('batchGetCampaignStatuses', () => {
  it('fetches all campaigns across pages', async () => {
    const client = createMockClient();
    const page1: PaginatedResponse<CampaignDetail> = {
      items: [sampleCampaign],
      cursor: 'cursor_2',
      hasMore: true,
    };
    const page2: PaginatedResponse<CampaignDetail> = {
      items: [{ ...sampleCampaign, campaignId: 'camp_def456' }],
      hasMore: false,
    };
    (client.get as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(page1)
      .mockResolvedValueOnce(page2);

    const results = await batchGetCampaignStatuses(client);

    expect(results).toHaveLength(2);
    expect(results[0].campaignId).toBe('camp_abc123');
    expect(results[1].campaignId).toBe('camp_def456');
    expect(client.get).toHaveBeenCalledTimes(2);
  });

  it('handles single page of results', async () => {
    const client = createMockClient();
    (client.get as ReturnType<typeof vi.fn>).mockResolvedValue({
      items: [sampleCampaign],
      hasMore: false,
    });

    const results = await batchGetCampaignStatuses(client);
    expect(results).toHaveLength(1);
    expect(client.get).toHaveBeenCalledTimes(1);
  });
});
