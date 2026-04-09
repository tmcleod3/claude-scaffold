/**
 * Kongo Variants tests — CRUD, AI generation, slot regeneration, rotation.
 */

import { describe, it, expect, vi } from 'vitest';

import { KongoClient, KongoApiError } from '../../lib/kongo/client.js';
import {
  createVariant,
  listVariants,
  getVariant,
  updateVariant,
  deleteVariant,
  generateVariants,
  regenerateVariantSlots,
  setRotation,
} from '../../lib/kongo/variants.js';
import type { VariantDetail, GenerateVariantsResult } from '../../lib/kongo/types.js';

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

const sampleVariant: VariantDetail = {
  variantId: 'var_abc123',
  label: 'VC Version',
  order: 0,
  slotCount: 3,
  slotValues: { headline: 'The Future of AI', tagline: 'Enterprise-grade', cta_text: 'Request Demo' },
  weight: 2.0,
  source: 'vc',
  isActive: true,
  views: 650,
  conversions: 52,
  cvr: 8.0,
  createdAt: '2026-04-01T12:00:00.000Z',
};

describe('createVariant', () => {
  it('sends POST to /engine/campaigns/:id/variants', async () => {
    const client = createMockClient();
    (client.post as ReturnType<typeof vi.fn>).mockResolvedValue(sampleVariant);

    const result = await createVariant(client, 'camp_xyz', {
      label: 'VC Version',
      slotValues: { headline: 'The Future of AI' },
      weight: 2.0,
      source: 'vc',
    });

    expect(result.variantId).toBe('var_abc123');
    expect(client.post).toHaveBeenCalledWith(
      '/engine/campaigns/camp_xyz/variants',
      { label: 'VC Version', slotValues: { headline: 'The Future of AI' }, weight: 2.0, source: 'vc' },
    );
  });
});

describe('listVariants', () => {
  it('sends GET to /engine/campaigns/:id/variants', async () => {
    const client = createMockClient();
    (client.get as ReturnType<typeof vi.fn>).mockResolvedValue([sampleVariant]);

    const result = await listVariants(client, 'camp_xyz');
    expect(result).toHaveLength(1);
    expect(result[0].label).toBe('VC Version');
    expect(client.get).toHaveBeenCalledWith('/engine/campaigns/camp_xyz/variants');
  });
});

describe('getVariant', () => {
  it('sends GET with variant ID', async () => {
    const client = createMockClient();
    (client.get as ReturnType<typeof vi.fn>).mockResolvedValue(sampleVariant);

    const result = await getVariant(client, 'camp_xyz', 'var_abc123');
    expect(result.slotValues?.headline).toBe('The Future of AI');
    expect(client.get).toHaveBeenCalledWith('/engine/campaigns/camp_xyz/variants/var_abc123');
  });
});

describe('updateVariant', () => {
  it('sends PATCH with updates', async () => {
    const client = createMockClient();
    (client.patch as ReturnType<typeof vi.fn>).mockResolvedValue({ ...sampleVariant, weight: 3.0 });

    const result = await updateVariant(client, 'camp_xyz', 'var_abc123', { weight: 3.0 });

    expect(result.weight).toBe(3.0);
    expect(client.patch).toHaveBeenCalledWith(
      '/engine/campaigns/camp_xyz/variants/var_abc123',
      { weight: 3.0 },
    );
  });

  it('can deactivate a variant', async () => {
    const client = createMockClient();
    (client.patch as ReturnType<typeof vi.fn>).mockResolvedValue({ ...sampleVariant, isActive: false });

    const result = await updateVariant(client, 'camp_xyz', 'var_abc123', { isActive: false });
    expect(result.isActive).toBe(false);
  });
});

describe('deleteVariant', () => {
  it('sends DELETE', async () => {
    const client = createMockClient();
    (client.delete as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

    await deleteVariant(client, 'camp_xyz', 'var_abc123');
    expect(client.delete).toHaveBeenCalledWith('/engine/campaigns/camp_xyz/variants/var_abc123');
  });
});

describe('generateVariants', () => {
  it('sends POST to generate endpoint with AI config', async () => {
    const client = createMockClient();
    const genResult: GenerateVariantsResult = {
      variants: [
        { variantId: 'var_gen1', label: 'VC-optimized', order: 0, slotCount: 3, source: 'vc', createdAt: '...' },
        { variantId: 'var_gen2', label: 'Angel-focused', order: 1, slotCount: 3, source: 'angel', createdAt: '...' },
        { variantId: 'var_gen3', label: 'Family Office', order: 2, slotCount: 3, source: 'family-office', createdAt: '...' },
      ],
      generation: { inputTokens: 1200, outputTokens: 800, costUsd: 0.012, durationMs: 2800 },
    };
    (client.post as ReturnType<typeof vi.fn>).mockResolvedValue(genResult);

    const result = await generateVariants(client, 'camp_xyz', {
      count: 3,
      vary: ['headline', 'tagline', 'cta_text'],
      baseValues: { company_name: 'Acme Corp' },
      context: 'Target Series A VCs in fintech',
      sources: ['vc', 'angel', 'family-office'],
    });

    expect(result.variants).toHaveLength(3);
    expect(result.generation.costUsd).toBe(0.012);
    expect(client.post).toHaveBeenCalledWith(
      '/engine/campaigns/camp_xyz/variants/generate',
      expect.objectContaining({ count: 3, vary: ['headline', 'tagline', 'cta_text'] }),
    );
  });

  it('rejects count outside 1-20', async () => {
    const client = createMockClient();
    await expect(
      generateVariants(client, 'camp_xyz', { count: 0, vary: ['headline'] }),
    ).rejects.toThrow('1-20');
    await expect(
      generateVariants(client, 'camp_xyz', { count: 21, vary: ['headline'] }),
    ).rejects.toThrow('1-20');
  });

  it('rejects empty vary array', async () => {
    const client = createMockClient();
    await expect(
      generateVariants(client, 'camp_xyz', { count: 3, vary: [] }),
    ).rejects.toThrow('At least one');
  });
});

describe('regenerateVariantSlots', () => {
  it('sends POST to regenerate endpoint', async () => {
    const client = createMockClient();
    (client.post as ReturnType<typeof vi.fn>).mockResolvedValue(sampleVariant);

    await regenerateVariantSlots(client, 'camp_xyz', 'var_abc123', {
      slots: ['headline', 'cta_text'],
      direction: 'Make it more concise',
    });

    expect(client.post).toHaveBeenCalledWith(
      '/engine/campaigns/camp_xyz/variants/var_abc123/regenerate',
      { slots: ['headline', 'cta_text'], direction: 'Make it more concise' },
    );
  });

  it('rejects empty slots array', async () => {
    const client = createMockClient();
    await expect(
      regenerateVariantSlots(client, 'camp_xyz', 'var_abc123', { slots: [] }),
    ).rejects.toThrow('At least one');
  });
});

describe('setRotation', () => {
  it('sends PUT to update rotation strategy', async () => {
    const client = createMockClient();
    (client.put as ReturnType<typeof vi.fn>).mockResolvedValue({});

    await setRotation(client, 'camp_xyz', 'bandit');

    expect(client.put).toHaveBeenCalledWith(
      '/engine/campaigns/camp_xyz',
      { rotationStrategy: 'bandit' },
    );
  });
});
