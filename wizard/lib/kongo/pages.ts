/**
 * Kongo Pages — Page lifecycle operations.
 *
 * Generate landing pages from PRD seed content, poll for completion,
 * retrieve HTML, list/delete pages, and batch generate.
 *
 * Uses the real Kongo API surface:
 * - POST /engine/pages — generate a page (accepts brief + template for structured input)
 * - GET /engine/pages/:pageId — poll status until READY
 * - GET /engine/pages/:pageId/html — get raw HTML
 * - GET /engine/pages — list pages (cursor pagination)
 * - DELETE /engine/pages/:pageId — soft delete
 * - POST /engine/pages/batch — batch generate 1-50 pages
 *
 * PRD Reference: PRD-kongo-integration.md §4.1
 */

import { randomUUID } from 'node:crypto';

import { KongoClient, KongoApiError } from './client.js';
import type {
  CreatePageRequest,
  CreatePageResponse,
  PageDetail,
  ListPagesOptions,
  PaginatedResponse,
  BatchPageConfig,
  BatchPageResult,
  PrdSeedContent,
} from './types.js';

// ── Page Operations ──────────────────────────────────────

const DEFAULT_POLL_INTERVAL_MS = 3_000;
const DEFAULT_POLL_TIMEOUT_MS = 120_000;

/**
 * Create a page from raw configuration.
 * Returns immediately with pageId — generation runs async (2-10 min).
 */
export async function createPage(
  client: KongoClient,
  config: CreatePageRequest,
): Promise<CreatePageResponse> {
  return client.post<CreatePageResponse>(
    '/engine/pages',
    config,
    { 'Idempotency-Key': randomUUID() },
  );
}

/**
 * Create a landing page from PRD seed content.
 * Maps PrdSeedContent to Kongo's CreatePageRequest with brief + template: 'landing-page'.
 */
export async function createPageFromPrd(
  client: KongoClient,
  seed: PrdSeedContent,
): Promise<CreatePageResponse> {
  const brief: Record<string, unknown> = {
    companyName: seed.projectName,
    headline: seed.headline,
    subheadline: seed.subheadline,
    valuePropositions: seed.valueProps,
    ctaText: seed.ctaText,
    ctaUrl: seed.ctaUrl,
  };
  if (seed.logoUrl) brief.logoUrl = seed.logoUrl;
  if (seed.socialProof?.length) brief.socialProof = seed.socialProof;

  const metadata: Record<string, unknown> = {
    source: 'voidforge',
    projectName: seed.projectName,
  };
  if (seed.campaignId) metadata.campaignId = seed.campaignId;
  if (seed.platform) metadata.platform = seed.platform;

  return createPage(client, {
    companyName: seed.projectName,
    content: [
      seed.headline,
      seed.subheadline,
      ...seed.valueProps,
      seed.ctaText,
      ...(seed.socialProof ?? []),
    ].join('\n\n'),
    brief,
    template: 'landing-page',
    style: {
      colors: seed.brandColors,
    },
    hosted: true,
    metadata,
  });
}

/**
 * Get the current status and details of a page.
 */
export async function getPageStatus(
  client: KongoClient,
  pageId: string,
): Promise<PageDetail> {
  return client.get<PageDetail>(`/engine/pages/${encodeURIComponent(pageId)}`);
}

/**
 * Get the raw HTML of a generated page.
 * Only works when status is READY.
 */
export async function getPageHtml(
  client: KongoClient,
  pageId: string,
  options?: { tracking?: boolean; minify?: boolean },
): Promise<string> {
  const query: Record<string, string | boolean | undefined> = {};
  if (options?.tracking !== undefined) query.tracking = String(options.tracking);
  if (options?.minify !== undefined) query.minify = String(options.minify);

  return client.get<string>(
    `/engine/pages/${encodeURIComponent(pageId)}/html`,
    query,
  );
}

/**
 * Poll a page until it reaches READY status or timeout.
 * Throws on ERROR status or timeout.
 */
export async function awaitPage(
  client: KongoClient,
  pageId: string,
  options?: { timeoutMs?: number; intervalMs?: number },
): Promise<PageDetail> {
  const timeoutMs = options?.timeoutMs ?? DEFAULT_POLL_TIMEOUT_MS;
  const intervalMs = options?.intervalMs ?? DEFAULT_POLL_INTERVAL_MS;
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const page = await getPageStatus(client, pageId);

    if (page.status === 'READY') return page;

    if (page.status === 'ERROR') {
      throw new KongoApiError(
        'GENERATION_FAILED',
        `Page generation failed: ${page.error?.message ?? 'Unknown error'}`,
        500,
      );
    }

    // Still GENERATING — wait and retry
    const remaining = deadline - Date.now();
    if (remaining <= 0) break;
    await sleep(Math.min(intervalMs, remaining));
  }

  throw new KongoApiError(
    'TIMEOUT',
    `Page ${pageId} generation timed out after ${timeoutMs / 1000}s`,
    408,
    true,
  );
}

/**
 * List pages with cursor-based pagination.
 */
export async function listPages(
  client: KongoClient,
  options?: ListPagesOptions,
): Promise<PaginatedResponse<PageDetail>> {
  const query: Record<string, string | number | boolean | undefined> = {};
  if (options?.cursor) query.cursor = options.cursor;
  if (options?.limit) query.limit = options.limit;
  if (options?.status) query.status = options.status;
  if (options?.sort) query.sort = options.sort;
  if (options?.order) query.order = options.order;

  return client.get<PaginatedResponse<PageDetail>>('/engine/pages', query);
}

/**
 * Soft-delete a page. HTML is purged immediately, metadata retained 90 days.
 */
export async function deletePage(
  client: KongoClient,
  pageId: string,
): Promise<void> {
  await client.delete(`/engine/pages/${encodeURIComponent(pageId)}`);
}

/**
 * Batch generate 1-50 pages in a single request.
 */
export async function batchGenerate(
  client: KongoClient,
  configs: BatchPageConfig[],
): Promise<BatchPageResult[]> {
  if (configs.length === 0 || configs.length > 50) {
    throw new KongoApiError(
      'VALIDATION_ERROR',
      `Batch size must be 1-50, got ${configs.length}`,
      400,
    );
  }

  const result = await client.post<{ pages: BatchPageResult[] }>(
    '/engine/pages/batch',
    { pages: configs },
    { 'Idempotency-Key': randomUUID() },
  );

  return result.pages;
}

// ── Helpers ──────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
