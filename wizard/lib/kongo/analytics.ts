/**
 * Kongo Analytics — Campaign analytics and computed growth signal.
 *
 * Kongo doesn't have a dedicated growth-signal endpoint, so we compute it
 * client-side from the campaign analytics data using statistical analysis.
 *
 * Real Kongo API endpoint:
 * - GET /engine/campaigns/:campaignId/analytics — per-variant breakdown
 *
 * PRD Reference: PRD-kongo-integration.md §4.3
 */

import { KongoClient } from './client.js';
import type {
  CampaignAnalytics,
  AnalyticsPeriod,
  ComputedGrowthSignal,
  GrowthRecommendation,
} from './types.js';

// ── Analytics Operations ─────────────────────────────────

/**
 * Get campaign analytics with per-variant, per-source, and daily breakdown.
 */
export async function getCampaignAnalytics(
  client: KongoClient,
  campaignId: string,
  period?: AnalyticsPeriod,
): Promise<CampaignAnalytics> {
  const query: Record<string, string | undefined> = {};
  if (period) query.period = period;
  return client.get<CampaignAnalytics>(
    `/engine/campaigns/${encodeURIComponent(campaignId)}/analytics`,
    query,
  );
}

// ── Computed Growth Signal ───────────────────────────────

// Minimum sample size per variant before making recommendations
const MIN_SAMPLE_SIZE = 100;
// Minimum total views before any signal is meaningful
const MIN_TOTAL_VIEWS = 200;
// Z-score threshold for 95% confidence
const Z_95 = 1.96;

/**
 * Compute a growth signal from campaign analytics.
 *
 * This replaces the hypothetical /growth-signal endpoint from the PRD.
 * Uses two-proportion z-test to determine if any variant significantly
 * outperforms the control (first variant by order).
 */
export function computeGrowthSignal(
  campaignId: string,
  analytics: CampaignAnalytics,
): ComputedGrowthSignal {
  const timestamp = new Date().toISOString();
  const variants = analytics.byVariant;

  // Not enough data yet
  if (analytics.summary.totalViews < MIN_TOTAL_VIEWS || variants.length < 2) {
    return {
      campaignId,
      timestamp,
      winningVariantId: null,
      confidence: 0,
      conversionRateDelta: 0,
      recommendation: 'wait',
      reasoning: variants.length < 2
        ? 'Need at least 2 variants to evaluate'
        : `Insufficient data: ${analytics.summary.totalViews} views (need ${MIN_TOTAL_VIEWS})`,
      sampleSize: { control: variants[0]?.views ?? 0, variant: 0 },
    };
  }

  // Control = first variant by creation order (the original, pre-variation baseline).
  // NOT the worst performer — using worst inflates z-scores and causes false positives.
  // Tiebreaker by variantId for deterministic selection across JS engines.
  const control = [...variants].sort(
    (a, b) => a.order - b.order || a.variantId.localeCompare(b.variantId),
  )[0];
  const challengers = variants.filter(v => v.variantId !== control.variantId);

  if (challengers.length === 0) {
    return {
      campaignId,
      timestamp,
      winningVariantId: null,
      confidence: 0,
      conversionRateDelta: 0,
      recommendation: 'wait',
      reasoning: 'Only the control variant exists — need at least one challenger',
      sampleSize: { control: control.views, variant: 0 },
    };
  }

  // Find best challenger by CVR (guard against NaN from 0-view variants)
  const best = challengers
    .filter(v => v.views > 0)
    .sort((a, b) => b.cvr - a.cvr)[0];

  if (!best) {
    return {
      campaignId,
      timestamp,
      winningVariantId: null,
      confidence: 0,
      conversionRateDelta: 0,
      recommendation: 'wait',
      reasoning: 'No challengers with traffic data yet',
      sampleSize: { control: control.views, variant: 0 },
    };
  }

  // Check minimum sample sizes
  if (best.views < MIN_SAMPLE_SIZE || control.views < MIN_SAMPLE_SIZE) {
    return {
      campaignId,
      timestamp,
      winningVariantId: null,
      confidence: 0,
      conversionRateDelta: 0,
      recommendation: 'wait',
      reasoning: `Insufficient per-variant data: best=${best.views}, control=${control.views} views (need ${MIN_SAMPLE_SIZE} each)`,
      sampleSize: { control: control.views, variant: best.views },
    };
  }

  // Two-proportion z-test (one-tailed: is best better than control?)
  const { zScore, pValue } = twoProportionZTest(
    best.conversions, best.views,
    control.conversions, control.views,
  );

  // Confidence = 1 - p_value (one-tailed). For two-tailed 95%, need p < 0.025.
  // We use one-tailed because we have a directional hypothesis (best > control).
  const confidence = 1 - pValue;
  const conversionRateDelta = best.cvr - control.cvr;
  const recommendation = computeRecommendation(confidence, conversionRateDelta, analytics.summary.totalViews);

  return {
    campaignId,
    timestamp,
    winningVariantId: confidence >= 0.95 ? best.variantId : null,
    confidence,
    conversionRateDelta,
    recommendation,
    reasoning: formatReasoning(best, control, confidence, recommendation),
    sampleSize: { control: control.views, variant: best.views },
  };
}

/**
 * Fetch analytics and compute growth signal in one call.
 */
export async function getGrowthSignal(
  client: KongoClient,
  campaignId: string,
  period?: AnalyticsPeriod,
): Promise<ComputedGrowthSignal> {
  const analytics = await getCampaignAnalytics(client, campaignId, period);
  return computeGrowthSignal(campaignId, analytics);
}

// ── Statistical Helpers ──────────────────────────────────

function twoProportionZTest(
  successA: number, nA: number,
  successB: number, nB: number,
): { zScore: number; pValue: number } {
  const pA = successA / nA;
  const pB = successB / nB;
  const pPooled = (successA + successB) / (nA + nB);
  const se = Math.sqrt(pPooled * (1 - pPooled) * (1 / nA + 1 / nB));

  if (nA === 0 || nB === 0 || !(se > 0)) return { zScore: 0, pValue: 1 };

  const zScore = (pA - pB) / se;
  // One-tailed p-value: P(Z >= z) = 1 - CDF(z)
  const pValue = 1 - normalCdf(zScore);

  return { zScore, pValue };
}

/**
 * Approximate normal CDF using Abramowitz and Stegun formula.
 * Returns P(Z <= z) for standard normal distribution.
 */
function normalCdf(z: number): number {
  if (z < -6) return 0;
  if (z > 6) return 1;

  const absZ = Math.abs(z);
  const t = 1 / (1 + 0.2316419 * absZ);
  const d = 0.3989422804014327; // 1/sqrt(2*PI)
  const p = d * Math.exp(-absZ * absZ / 2) *
    (t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.8212560 + t * 1.3302744)))));

  return z > 0 ? 1 - p : p;
}

function computeRecommendation(
  confidence: number,
  conversionRateDelta: number,
  totalViews: number,
): GrowthRecommendation {
  // High confidence winner
  if (confidence >= 0.95 && conversionRateDelta > 0) return 'scale';

  // Moderate confidence, positive trend — keep iterating
  if (confidence >= 0.80 && conversionRateDelta > 0) return 'iterate';

  // High confidence that all challengers underperform the control
  if (confidence >= 0.95 && conversionRateDelta < 0 && totalViews > 500) return 'kill';

  // Not enough signal yet
  return 'wait';
}

function formatReasoning(
  best: { variantId: string; label: string; cvr: number },
  control: { variantId: string; label: string; cvr: number },
  confidence: number,
  recommendation: GrowthRecommendation,
): string {
  const delta = (best.cvr - control.cvr).toFixed(2);

  switch (recommendation) {
    case 'scale':
      return `Variant "${best.label}" outperforms control by ${delta}pp CVR with ${(confidence * 100).toFixed(1)}% confidence. Scale this variant.`;
    case 'iterate':
      return `Variant "${best.label}" shows +${delta}pp CVR lift at ${(confidence * 100).toFixed(1)}% confidence. Continue testing for stronger signal.`;
    case 'kill':
      return `No variant shows significant improvement. Consider killing this campaign.`;
    case 'wait':
      return `Insufficient data for recommendation. Current best: "${best.label}" at ${best.cvr.toFixed(2)}% CVR.`;
  }
}
