/**
 * Kongo Variants — Variant lifecycle and AI generation.
 *
 * Create, list, update, delete variants within campaigns.
 * AI-powered bulk variant generation and slot regeneration.
 *
 * Real Kongo API endpoints:
 * - POST /engine/campaigns/:campaignId/variants — create variant
 * - GET /engine/campaigns/:campaignId/variants — list variants
 * - GET /engine/campaigns/:campaignId/variants/:variantId — get variant
 * - PATCH /engine/campaigns/:campaignId/variants/:variantId — update
 * - DELETE /engine/campaigns/:campaignId/variants/:variantId — deactivate
 * - POST /engine/campaigns/:campaignId/variants/generate — AI generate N variants
 * - POST /engine/campaigns/:campaignId/variants/:variantId/regenerate — regen slots
 *
 * PRD Reference: PRD-kongo-integration.md §4.2
 */

import { KongoClient, KongoApiError } from './client.js';
import type {
  CreateVariantRequest,
  VariantDetail,
  UpdateVariantRequest,
  GenerateVariantsRequest,
  GenerateVariantsResult,
  RegenerateVariantRequest,
} from './types.js';

// ── Variant Operations ───────────────────────────────────

function campaignVariantsPath(campaignId: string): string {
  return `/engine/campaigns/${encodeURIComponent(campaignId)}/variants`;
}

function variantPath(campaignId: string, variantId: string): string {
  return `${campaignVariantsPath(campaignId)}/${encodeURIComponent(variantId)}`;
}

/**
 * Create a single variant with explicit slot values.
 */
export async function createVariant(
  client: KongoClient,
  campaignId: string,
  config: CreateVariantRequest,
): Promise<VariantDetail> {
  return client.post<VariantDetail>(campaignVariantsPath(campaignId), config);
}

/**
 * List all variants for a campaign.
 * Returns view counts, conversions, CVR, weights, and direct URLs.
 */
export async function listVariants(
  client: KongoClient,
  campaignId: string,
): Promise<VariantDetail[]> {
  return client.get<VariantDetail[]>(campaignVariantsPath(campaignId));
}

/**
 * Get a single variant with full details including slotValues and compiledHtml.
 */
export async function getVariant(
  client: KongoClient,
  campaignId: string,
  variantId: string,
): Promise<VariantDetail> {
  return client.get<VariantDetail>(variantPath(campaignId, variantId));
}

/**
 * Update a variant's label, slot values, weight, or active status.
 * Slot value updates are merged (existing preserved, new override).
 */
export async function updateVariant(
  client: KongoClient,
  campaignId: string,
  variantId: string,
  updates: UpdateVariantRequest,
): Promise<VariantDetail> {
  return client.patch<VariantDetail>(variantPath(campaignId, variantId), updates);
}

/**
 * Deactivate a variant (soft delete).
 */
export async function deleteVariant(
  client: KongoClient,
  campaignId: string,
  variantId: string,
): Promise<void> {
  await client.delete(variantPath(campaignId, variantId));
}

/**
 * AI-generate multiple variants in a single call.
 * Uses Claude Sonnet to produce N variants varying specified slots.
 * ~$0.01, ~3s for 5 variants.
 */
export async function generateVariants(
  client: KongoClient,
  campaignId: string,
  config: GenerateVariantsRequest,
): Promise<GenerateVariantsResult> {
  if (config.count < 1 || config.count > 20) {
    throw new KongoApiError(
      'VALIDATION_ERROR',
      `Variant count must be 1-20, got ${config.count}`,
      400,
    );
  }
  if (config.vary.length === 0) {
    throw new KongoApiError(
      'VALIDATION_ERROR',
      'At least one slot name must be specified in vary',
      400,
    );
  }

  return client.post<GenerateVariantsResult>(
    `${campaignVariantsPath(campaignId)}/generate`,
    config,
  );
}

/**
 * Regenerate specific slots of an existing variant using AI.
 * Merged values are recompiled into HTML.
 */
export async function regenerateVariantSlots(
  client: KongoClient,
  campaignId: string,
  variantId: string,
  config: RegenerateVariantRequest,
): Promise<VariantDetail> {
  if (config.slots.length === 0) {
    throw new KongoApiError(
      'VALIDATION_ERROR',
      'At least one slot name must be specified',
      400,
    );
  }

  return client.post<VariantDetail>(
    `${variantPath(campaignId, variantId)}/regenerate`,
    config,
  );
}

/**
 * Set rotation strategy for a campaign.
 * Convenience wrapper around updateCampaign — updates only rotationStrategy.
 */
export async function setRotation(
  client: KongoClient,
  campaignId: string,
  strategy: 'weighted' | 'equal' | 'bandit',
): Promise<void> {
  await client.put(
    `/engine/campaigns/${encodeURIComponent(campaignId)}`,
    { rotationStrategy: strategy },
  );
}
