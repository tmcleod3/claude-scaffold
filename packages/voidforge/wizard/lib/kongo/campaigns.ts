/**
 * Kongo Campaigns — Campaign lifecycle operations.
 *
 * Create, list, update, publish/unpublish, and delete campaigns.
 * Campaigns group pages + variants for A/B testing with rotation strategies.
 *
 * Real Kongo API endpoints:
 * - POST /engine/campaigns — create
 * - GET /engine/campaigns — list (cursor pagination)
 * - GET /engine/campaigns/:campaignId — get detail
 * - PUT /engine/campaigns/:campaignId — update
 * - DELETE /engine/campaigns/:campaignId — archive (soft delete)
 * - POST /engine/campaigns/:campaignId/publish — publish
 * - DELETE /engine/campaigns/:campaignId/publish — unpublish
 *
 * PRD Reference: PRD-kongo-integration.md §4.2
 */

import { KongoClient } from './client.js';
import type {
  CreateCampaignRequest,
  CampaignDetail,
  UpdateCampaignRequest,
  PublishResult,
  ListCampaignsOptions,
  PaginatedResponse,
} from './types.js';

// ── Campaign Operations ──────────────────────────────────

/**
 * Create a new campaign.
 * Requires a templateId (page ID) to base variants on.
 */
export async function createCampaign(
  client: KongoClient,
  config: CreateCampaignRequest,
): Promise<CampaignDetail> {
  return client.post<CampaignDetail>('/engine/campaigns', config);
}

/**
 * Get a single campaign by ID.
 * Returns full details including template info, variants, and stats.
 */
export async function getCampaign(
  client: KongoClient,
  campaignId: string,
): Promise<CampaignDetail> {
  return client.get<CampaignDetail>(`/engine/campaigns/${encodeURIComponent(campaignId)}`);
}

/**
 * List campaigns with cursor-based pagination.
 */
export async function listCampaigns(
  client: KongoClient,
  options?: ListCampaignsOptions,
): Promise<PaginatedResponse<CampaignDetail>> {
  const query: Record<string, string | number | boolean | undefined> = {};
  if (options?.cursor) query.cursor = options.cursor;
  if (options?.limit) query.limit = options.limit;
  if (options?.published !== undefined) query.published = options.published;
  if (options?.search) query.search = options.search;

  return client.get<PaginatedResponse<CampaignDetail>>('/engine/campaigns', query);
}

/**
 * Update a campaign's rotation strategy, tracking, access gate, or metadata.
 * Slug and template cannot be changed after creation.
 */
export async function updateCampaign(
  client: KongoClient,
  campaignId: string,
  updates: UpdateCampaignRequest,
): Promise<CampaignDetail> {
  return client.put<CampaignDetail>(
    `/engine/campaigns/${encodeURIComponent(campaignId)}`,
    updates,
  );
}

/**
 * Archive a campaign (soft delete). Unpublishes automatically.
 */
export async function deleteCampaign(
  client: KongoClient,
  campaignId: string,
): Promise<void> {
  await client.delete(`/engine/campaigns/${encodeURIComponent(campaignId)}`);
}

/**
 * Publish a campaign — provisions DNS CNAME at {slug}.kongo.io.
 * Requires at least 1 active variant. Idempotent.
 */
export async function publishCampaign(
  client: KongoClient,
  campaignId: string,
): Promise<PublishResult> {
  return client.post<PublishResult>(
    `/engine/campaigns/${encodeURIComponent(campaignId)}/publish`,
  );
}

/**
 * Unpublish a campaign — removes DNS record.
 */
export async function unpublishCampaign(
  client: KongoClient,
  campaignId: string,
): Promise<void> {
  await client.delete(
    `/engine/campaigns/${encodeURIComponent(campaignId)}/publish`,
  );
}

/**
 * Get statuses for all active campaigns.
 * Uses the list endpoint since Kongo doesn't have a batch-status endpoint.
 */
const MAX_BATCH_PAGES = 20;

export async function batchGetCampaignStatuses(
  client: KongoClient,
): Promise<CampaignDetail[]> {
  const results: CampaignDetail[] = [];
  let cursor: string | undefined;
  let pageCount = 0;

  do {
    if (++pageCount > MAX_BATCH_PAGES) break;
    const page = await listCampaigns(client, { cursor, limit: 100 });
    results.push(...page.items);
    cursor = page.hasMore ? page.cursor : undefined;
  } while (cursor);

  return results;
}
