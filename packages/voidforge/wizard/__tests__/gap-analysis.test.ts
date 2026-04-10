/**
 * Gap analysis tests — findWeakestDimension pure logic.
 * Tier 1: Pure deterministic functions, no mocks needed.
 */

import { describe, it, expect } from 'vitest';
import { findWeakestDimension } from '../lib/gap-analysis.js';
import type { SituationModel, DimensionScore } from '../lib/deep-current.js';

function makeDimension(score: number, gaps: string[] = []): DimensionScore {
  return { score, gaps, lastUpdated: new Date().toISOString() };
}

function makeModel(dims: Partial<Record<string, number>> = {}): SituationModel {
  return {
    projectState: 'PARTIAL',
    projectName: 'test-project',
    lastScan: new Date().toISOString(),
    dimensions: {
      featureCompleteness: makeDimension(dims.featureCompleteness ?? 50),
      quality: makeDimension(dims.quality ?? 50),
      performance: makeDimension(dims.performance ?? 50),
      growthReadiness: makeDimension(dims.growthReadiness ?? 50),
      revenuePotential: makeDimension(dims.revenuePotential ?? 50),
    },
    campaignHistory: [],
    pendingProposals: [],
    averagePredictionAccuracy: 0,
    autonomyTier: 1,
  };
}

describe('findWeakestDimension', () => {
  it('returns the lowest-scoring dimension', () => {
    const model = makeModel({
      featureCompleteness: 80,
      quality: 60,
      performance: 40,
      growthReadiness: 70,
      revenuePotential: 90,
    });
    const result = findWeakestDimension(model);
    expect(result.name).toBe('Performance');
    expect(result.score).toBe(40);
  });

  it('returns first dimension when all are equal', () => {
    const model = makeModel();
    const result = findWeakestDimension(model);
    // All 50 — first in sort order wins (stable sort)
    expect(result.score).toBe(50);
  });

  it('handles zero scores', () => {
    const model = makeModel({
      featureCompleteness: 0,
      quality: 10,
      performance: 20,
      growthReadiness: 30,
      revenuePotential: 40,
    });
    const result = findWeakestDimension(model);
    expect(result.name).toBe('Feature Completeness');
    expect(result.score).toBe(0);
  });

  it('returns the dimension with gaps', () => {
    const model = makeModel({ revenuePotential: 5 });
    model.dimensions.revenuePotential.gaps = ['No payment integration', 'No pricing page'];
    const result = findWeakestDimension(model);
    expect(result.name).toBe('Revenue Potential');
    expect(result.gaps).toHaveLength(2);
  });
});
