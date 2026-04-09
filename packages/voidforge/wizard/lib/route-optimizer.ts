/**
 * Paris's Route Optimizer — ROI-weighted campaign sequencing (v12.3).
 *
 * Given multiple possible campaigns (from the proposal generator), Paris
 * computes the optimal execution order based on estimated ROI, dependencies,
 * risk, and urgency.
 *
 * PRD Reference: ROADMAP v12.3, DEEP_CURRENT.md Paris's role
 */

import type { CampaignProposal } from './campaign-proposer.js';
import type { SituationModel } from './deep-current.js';

// ── Route Score ───────────────────────────────────────

interface RouteScore {
  proposal: CampaignProposal;
  roiScore: number;        // 0-100 — estimated return / effort
  urgencyScore: number;    // 0-100 — how time-sensitive
  riskScore: number;       // 0-100 — lower = safer (inverted)
  totalScore: number;      // Weighted combination
}

// ── Scoring Weights ───────────────────────────────────

const WEIGHTS = {
  roi: 0.40,
  urgency: 0.35,
  risk: 0.25,     // Inverted — lower risk gets higher score
};

// ── ROI Estimation ────────────────────────────────────

function estimateRoi(proposal: CampaignProposal, model: SituationModel): number {
  // ROI = (dimension improvement potential) / (estimated effort)
  const currentScore = proposal.dimensionScore;
  const potentialGain = Math.min(30, 100 - currentScore); // Cap at 30-point improvement
  const effort = proposal.estimatedSessions;

  // Higher gain per session = higher ROI
  const roiRatio = potentialGain / Math.max(effort, 1);
  return Math.min(100, Math.round(roiRatio * 10)); // Scale to 0-100
}

// ── Urgency Scoring ───────────────────────────────────

function scoreUrgency(proposal: CampaignProposal, model: SituationModel): number {
  const dim = proposal.dimension;
  const score = proposal.dimensionScore;

  // Critical defects are always urgent
  if (dim === 'quality' && score < 30) return 100;

  // Security issues are urgent
  if (dim === 'performance' && model.lastSiteScan && !model.lastSiteScan.security.https) return 90;

  // Low scores are more urgent
  if (score < 20) return 80;
  if (score < 40) return 60;
  if (score < 60) return 40;

  // Revenue is urgent for OPERATING projects
  if (dim === 'revenuePotential' && model.projectState === 'OPERATING') return 70;

  return 20; // Low urgency by default
}

// ── Risk Scoring ──────────────────────────────────────

function scoreRisk(proposal: CampaignProposal): number {
  // Revenue/payment campaigns are higher risk (real money)
  if (proposal.dimension === 'revenuePotential') return 70;

  // Feature campaigns have moderate risk (new code)
  if (proposal.dimension === 'featureCompleteness') return 50;

  // Quality and performance campaigns are low risk
  if (proposal.dimension === 'quality') return 20;
  if (proposal.dimension === 'performance') return 25;

  // Growth foundation is low risk (additive, no existing code modified)
  if (proposal.dimension === 'growthReadiness') return 30;

  return 40;
}

// ── Route Optimization ────────────────────────────────

/**
 * Score and rank campaign proposals by optimal execution order.
 * Returns proposals sorted by total score (highest first = execute first).
 */
export function optimizeRoute(proposals: CampaignProposal[], model: SituationModel): RouteScore[] {
  const scored = proposals.map(proposal => {
    const roiScore = estimateRoi(proposal, model);
    const urgencyScore = scoreUrgency(proposal, model);
    const riskScore = 100 - scoreRisk(proposal); // Invert: low risk = high score

    const totalScore = Math.round(
      roiScore * WEIGHTS.roi +
      urgencyScore * WEIGHTS.urgency +
      riskScore * WEIGHTS.risk
    );

    return { proposal, roiScore, urgencyScore, riskScore, totalScore };
  });

  // Sort by total score descending (best first)
  scored.sort((a, b) => b.totalScore - a.totalScore);
  return scored;
}

/**
 * Pick the single best campaign to execute next.
 */
export function pickBestCampaign(proposals: CampaignProposal[], model: SituationModel): CampaignProposal | null {
  if (proposals.length === 0) return null;
  const ranked = optimizeRoute(proposals, model);
  return ranked[0].proposal;
}

export type { RouteScore };
