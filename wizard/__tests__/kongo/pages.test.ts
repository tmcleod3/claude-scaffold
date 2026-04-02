/**
 * Kongo Pages tests — page lifecycle, PRD-to-page, polling, batch generation.
 *
 * Mocks the KongoClient to test page operations in isolation.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { KongoClient, KongoApiError } from '../../lib/kongo/client.js';
import {
  createPage,
  createPageFromPrd,
  getPageStatus,
  getPageHtml,
  awaitPage,
  listPages,
  deletePage,
  batchGenerate,
} from '../../lib/kongo/pages.js';
import type { PrdSeedContent, PageDetail, CreatePageResponse } from '../../lib/kongo/types.js';

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

// ── Tests ────────────────────────────────────────────────

describe('createPage', () => {
  it('sends POST to /engine/pages with config', async () => {
    const client = createMockClient();
    const expected: CreatePageResponse = {
      pageId: 'pg_abc123',
      status: 'GENERATING',
      statusUrl: 'https://kongo.io/api/v1/engine/pages/pg_abc123',
      createdAt: '2026-04-01T12:00:00.000Z',
    };
    (client.post as ReturnType<typeof vi.fn>).mockResolvedValue(expected);

    const result = await createPage(client, {
      companyName: 'Test Corp',
      content: 'We build AI tools',
      template: 'landing-page',
      hosted: true,
    });

    expect(result).toEqual(expected);
    expect(client.post).toHaveBeenCalledWith(
      '/engine/pages',
      {
        companyName: 'Test Corp',
        content: 'We build AI tools',
        template: 'landing-page',
        hosted: true,
      },
      expect.objectContaining({ 'Idempotency-Key': expect.any(String) }),
    );
  });
});

describe('createPageFromPrd', () => {
  const seed: PrdSeedContent = {
    projectName: 'Acme AI',
    headline: 'Build Faster with AI',
    subheadline: 'Enterprise-grade AI infrastructure',
    valueProps: ['10x faster', 'SOC 2 compliant', 'Scales to millions'],
    ctaText: 'Start Free Trial',
    ctaUrl: 'https://acme.ai/signup',
    brandColors: { primary: '#1a1a2e', secondary: '#16213e', accent: '#0f3460' },
    logoUrl: 'https://acme.ai/logo.png',
    socialProof: ['Used by 500+ teams', 'SOC 2 certified'],
    campaignId: 'camp_vf123',
    platform: 'google',
  };

  it('maps PrdSeedContent to CreatePageRequest with brief and template', async () => {
    const client = createMockClient();
    (client.post as ReturnType<typeof vi.fn>).mockResolvedValue({
      pageId: 'pg_prd456',
      status: 'GENERATING',
      statusUrl: 'https://kongo.io/api/v1/engine/pages/pg_prd456',
      createdAt: '2026-04-01T12:00:00.000Z',
    });

    await createPageFromPrd(client, seed);

    const postCall = (client.post as ReturnType<typeof vi.fn>).mock.calls[0];
    const body = postCall[1] as Record<string, unknown>;

    expect(body.companyName).toBe('Acme AI');
    expect(body.template).toBe('landing-page');
    expect(body.hosted).toBe(true);
    expect(body.style).toEqual({ colors: seed.brandColors });

    const brief = body.brief as Record<string, unknown>;
    expect(brief.companyName).toBe('Acme AI');
    expect(brief.headline).toBe('Build Faster with AI');
    expect(brief.subheadline).toBe('Enterprise-grade AI infrastructure');
    expect(brief.valuePropositions).toEqual(seed.valueProps);
    expect(brief.ctaText).toBe('Start Free Trial');
    expect(brief.ctaUrl).toBe('https://acme.ai/signup');
    expect(brief.logoUrl).toBe('https://acme.ai/logo.png');
    expect(brief.socialProof).toEqual(['Used by 500+ teams', 'SOC 2 certified']);

    const metadata = body.metadata as Record<string, unknown>;
    expect(metadata.source).toBe('voidforge');
    expect(metadata.projectName).toBe('Acme AI');
    expect(metadata.campaignId).toBe('camp_vf123');
    expect(metadata.platform).toBe('google');
  });

  it('handles minimal seed without optional fields', async () => {
    const client = createMockClient();
    (client.post as ReturnType<typeof vi.fn>).mockResolvedValue({
      pageId: 'pg_min789',
      status: 'GENERATING',
      statusUrl: 'https://kongo.io/api/v1/engine/pages/pg_min789',
      createdAt: '2026-04-01T12:00:00.000Z',
    });

    const minimalSeed: PrdSeedContent = {
      projectName: 'Simple App',
      headline: 'Simple App',
      subheadline: 'It is simple',
      valueProps: ['Fast'],
      ctaText: 'Try It',
      ctaUrl: 'https://simple.app',
      brandColors: { primary: '#000', secondary: '#333', accent: '#666' },
    };

    await createPageFromPrd(client, minimalSeed);

    const body = (client.post as ReturnType<typeof vi.fn>).mock.calls[0][1] as Record<string, unknown>;
    const brief = body.brief as Record<string, unknown>;
    expect(brief.logoUrl).toBeUndefined();
    expect(brief.socialProof).toBeUndefined();

    const metadata = body.metadata as Record<string, unknown>;
    expect(metadata.campaignId).toBeUndefined();
    expect(metadata.platform).toBeUndefined();
  });

  it('includes all value props and social proof in content field', async () => {
    const client = createMockClient();
    (client.post as ReturnType<typeof vi.fn>).mockResolvedValue({
      pageId: 'pg_content',
      status: 'GENERATING',
      statusUrl: 'https://kongo.io/api/v1/engine/pages/pg_content',
      createdAt: '2026-04-01T12:00:00.000Z',
    });

    await createPageFromPrd(client, seed);

    const body = (client.post as ReturnType<typeof vi.fn>).mock.calls[0][1] as Record<string, unknown>;
    const content = body.content as string;
    expect(content).toContain('Build Faster with AI');
    expect(content).toContain('10x faster');
    expect(content).toContain('Start Free Trial');
    expect(content).toContain('Used by 500+ teams');
  });
});

describe('getPageStatus', () => {
  it('sends GET to /engine/pages/:pageId', async () => {
    const client = createMockClient();
    const pageDetail: PageDetail = {
      pageId: 'pg_abc123',
      status: 'READY',
      companyName: 'Test Corp',
      html: '<html></html>',
      hostedUrl: 'https://test-corp.kongo.io',
      createdAt: '2026-04-01T12:00:00.000Z',
    };
    (client.get as ReturnType<typeof vi.fn>).mockResolvedValue(pageDetail);

    const result = await getPageStatus(client, 'pg_abc123');
    expect(result).toEqual(pageDetail);
    expect(client.get).toHaveBeenCalledWith('/engine/pages/pg_abc123');
  });
});

describe('getPageHtml', () => {
  it('sends GET to /engine/pages/:pageId/html', async () => {
    const client = createMockClient();
    (client.get as ReturnType<typeof vi.fn>).mockResolvedValue('<html><body>Hello</body></html>');

    const result = await getPageHtml(client, 'pg_abc123');
    expect(result).toBe('<html><body>Hello</body></html>');
  });

  it('passes tracking and minify options as query params', async () => {
    const client = createMockClient();
    (client.get as ReturnType<typeof vi.fn>).mockResolvedValue('<html></html>');

    await getPageHtml(client, 'pg_abc123', { tracking: false, minify: true });

    expect(client.get).toHaveBeenCalledWith(
      '/engine/pages/pg_abc123/html',
      { tracking: 'false', minify: 'true' },
    );
  });
});

describe('awaitPage', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it('returns immediately when page is READY', async () => {
    const client = createMockClient();
    const readyPage: PageDetail = {
      pageId: 'pg_ready',
      status: 'READY',
      companyName: 'Test',
      html: '<html></html>',
      createdAt: '2026-04-01T12:00:00.000Z',
    };
    (client.get as ReturnType<typeof vi.fn>).mockResolvedValue(readyPage);

    const result = await awaitPage(client, 'pg_ready');
    expect(result.status).toBe('READY');
    expect(client.get).toHaveBeenCalledTimes(1);
  });

  it('polls until READY', async () => {
    const client = createMockClient();
    let callCount = 0;
    (client.get as ReturnType<typeof vi.fn>).mockImplementation(() => {
      callCount++;
      if (callCount < 3) {
        return Promise.resolve({
          pageId: 'pg_pending',
          status: 'GENERATING',
          companyName: 'Test',
          createdAt: '2026-04-01T12:00:00.000Z',
        });
      }
      return Promise.resolve({
        pageId: 'pg_pending',
        status: 'READY',
        companyName: 'Test',
        html: '<html></html>',
        createdAt: '2026-04-01T12:00:00.000Z',
      });
    });

    const promise = awaitPage(client, 'pg_pending', { intervalMs: 1000 });
    await vi.advanceTimersByTimeAsync(5_000);
    const result = await promise;

    expect(result.status).toBe('READY');
    expect(callCount).toBe(3);
  });

  it('throws on ERROR status', async () => {
    const client = createMockClient();
    (client.get as ReturnType<typeof vi.fn>).mockResolvedValue({
      pageId: 'pg_err',
      status: 'ERROR',
      companyName: 'Test',
      error: { code: 'CONTENT_BLOCKED', message: 'Content flagged' },
      createdAt: '2026-04-01T12:00:00.000Z',
    });

    await expect(awaitPage(client, 'pg_err')).rejects.toThrow('Content flagged');
  });

  it('throws on timeout', async () => {
    const client = createMockClient();
    (client.get as ReturnType<typeof vi.fn>).mockResolvedValue({
      pageId: 'pg_slow',
      status: 'GENERATING',
      companyName: 'Test',
      createdAt: '2026-04-01T12:00:00.000Z',
    });

    // Capture the rejection immediately to prevent unhandled rejection
    let caughtError: unknown;
    const promise = awaitPage(client, 'pg_slow', { timeoutMs: 5000, intervalMs: 1000 })
      .catch((err: unknown) => { caughtError = err; });

    await vi.advanceTimersByTimeAsync(10_000);
    await promise;

    expect(caughtError).toBeDefined();
    expect((caughtError as Error).message).toContain('timed out');
  });

  afterEach(() => {
    vi.useRealTimers();
  });
});


describe('listPages', () => {
  it('sends GET to /engine/pages with query params', async () => {
    const client = createMockClient();
    (client.get as ReturnType<typeof vi.fn>).mockResolvedValue({
      items: [],
      hasMore: false,
    });

    await listPages(client, { limit: 10, status: 'READY', sort: 'createdAt', order: 'desc' });

    expect(client.get).toHaveBeenCalledWith('/engine/pages', {
      limit: 10,
      status: 'READY',
      sort: 'createdAt',
      order: 'desc',
    });
  });

  it('works with no options', async () => {
    const client = createMockClient();
    (client.get as ReturnType<typeof vi.fn>).mockResolvedValue({
      items: [],
      hasMore: false,
    });

    await listPages(client);
    expect(client.get).toHaveBeenCalledWith('/engine/pages', {});
  });
});

describe('deletePage', () => {
  it('sends DELETE to /engine/pages/:pageId', async () => {
    const client = createMockClient();
    (client.delete as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

    await deletePage(client, 'pg_abc123');
    expect(client.delete).toHaveBeenCalledWith('/engine/pages/pg_abc123');
  });
});

describe('batchGenerate', () => {
  it('sends POST to /engine/pages/batch', async () => {
    const client = createMockClient();
    (client.post as ReturnType<typeof vi.fn>).mockResolvedValue({
      pages: [
        { pageId: 'pg_batch1', status: 'GENERATING', statusUrl: '...', createdAt: '...' },
        { pageId: 'pg_batch2', status: 'GENERATING', statusUrl: '...', createdAt: '...' },
      ],
    });

    const result = await batchGenerate(client, [
      { companyName: 'Corp A', content: 'Content A' },
      { companyName: 'Corp B', content: 'Content B' },
    ]);

    expect(result).toHaveLength(2);
    expect(result[0].pageId).toBe('pg_batch1');
  });

  it('rejects empty batch', async () => {
    const client = createMockClient();
    await expect(batchGenerate(client, [])).rejects.toThrow('1-50');
  });

  it('rejects batch over 50', async () => {
    const client = createMockClient();
    const configs = Array.from({ length: 51 }, (_, i) => ({
      companyName: `Corp ${i}`,
      content: `Content ${i}`,
    }));
    await expect(batchGenerate(client, configs)).rejects.toThrow('1-50');
  });
});
