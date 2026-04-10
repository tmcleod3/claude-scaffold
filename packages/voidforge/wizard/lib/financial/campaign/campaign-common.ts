/**
 * Shared patterns across Google, TikTok, and Meta campaign adapters.
 *
 * Extracts: JSON parsing, error factory, objective mapping, spend aggregation.
 * PRD Reference: SS9.5, SS9.19.10, SS9.20.4
 */

import type {
  CampaignConfig,
  PlatformError,
  Cents,
  AdPlatform,
} from './base.js';

/** Platforms with full campaign adapter implementations. */
export type CampaignPlatform = 'google' | 'tiktok' | 'meta';

// ── JSON parsing ──────────────────────────────────────

/** Safely parse JSON, returning an error-shaped object on failure. */
export function safeParseJson(body: string): Record<string, unknown> {
  try {
    return JSON.parse(body) as Record<string, unknown>;
  } catch {
    return { error: { message: 'Non-JSON response' } };
  }
}

// ── Error factory ─────────────────────────────────────

/** Create a typed PlatformError for a given ad platform. */
export function makePlatformError(
  platform: AdPlatform,
  code: PlatformError['code'],
  originalCode: number,
  message: string,
  retryable: boolean = false,
  retryAfter?: number,
): PlatformError {
  return { platform, code, originalCode, message, retryable, retryAfter };
}

// ── Objective mapping ─────────────────────────────────

const GOOGLE_OBJECTIVES: Record<CampaignConfig['objective'], string> = {
  awareness: 'TARGET_IMPRESSION_SHARE',
  traffic: 'MAXIMIZE_CLICKS',
  conversions: 'MAXIMIZE_CONVERSIONS',
};

const TIKTOK_OBJECTIVES: Record<CampaignConfig['objective'], string> = {
  awareness: 'REACH',
  traffic: 'TRAFFIC',
  conversions: 'CONVERSIONS',
};

const META_OBJECTIVES: Record<CampaignConfig['objective'], string> = {
  awareness: 'OUTCOME_AWARENESS',
  traffic: 'OUTCOME_TRAFFIC',
  conversions: 'OUTCOME_SALES',
};

/** Map a CampaignConfig objective to a platform-specific objective string. */
export function mapObjective(platform: CampaignPlatform, objective: CampaignConfig['objective']): string {
  const maps: Record<CampaignPlatform, Record<CampaignConfig['objective'], string>> = {
    google: GOOGLE_OBJECTIVES,
    tiktok: TIKTOK_OBJECTIVES,
    meta: META_OBJECTIVES,
  };
  return maps[platform][objective];
}

// ── Spend aggregation ─────────────────────────────────

/** Aggregate total spend from campaign rows. */
export function aggregateSpend(campaigns: Array<{ spend: Cents }>): Cents {
  return campaigns.reduce(
    (sum, c) => (sum + c.spend) as Cents, 0 as Cents,
  );
}

// ── Compliance gate ───────────────────────────────────

/** Throw if campaign compliance has not passed. */
export function requireCompliance(config: CampaignConfig, platform: AdPlatform): void {
  if (config.complianceStatus !== 'passed') {
    throw makePlatformError(platform, 'UNKNOWN', 400, 'Campaign compliance not passed \u2014 cannot create');
  }
}
