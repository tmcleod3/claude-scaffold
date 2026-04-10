/**
 * Deep Current tests — path resolution, situation model lifecycle.
 * Tier 1: Pure path functions. Tier 2: Model persistence (mocked filesystem).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock filesystem
vi.mock('node:fs', () => ({
  existsSync: vi.fn(() => false),
}));
vi.mock('node:fs/promises', () => ({
  readFile: vi.fn(() => Promise.reject(new Error('ENOENT'))),
  writeFile: vi.fn(() => Promise.resolve()),
  mkdir: vi.fn(() => Promise.resolve()),
}));
vi.mock('../lib/site-scanner.js', () => ({
  scanSite: vi.fn(() => Promise.reject(new Error('Network not available'))),
  scoreScan: vi.fn(() => ({ performance: 50, seoScore: 40, securityScore: 60, growthReadiness: 30 })),
}));

import {
  deepCurrentDir,
  situationPath,
  proposalsDir,
  predictionsPath,
  correlationsPath,
  loadSituation,
  saveSituation,
} from '../lib/deep-current.js';
import type { SituationModel } from '../lib/deep-current.js';

describe('path resolution', () => {
  it('deepCurrentDir joins project dir with logs/deep-current', () => {
    expect(deepCurrentDir('/my/project')).toBe('/my/project/logs/deep-current');
  });

  it('situationPath points to situation.json', () => {
    expect(situationPath('/my/project')).toBe('/my/project/logs/deep-current/situation.json');
  });

  it('proposalsDir points to proposals/', () => {
    expect(proposalsDir('/my/project')).toBe('/my/project/logs/deep-current/proposals');
  });

  it('predictionsPath points to predictions.jsonl', () => {
    expect(predictionsPath('/my/project')).toBe('/my/project/logs/deep-current/predictions.jsonl');
  });

  it('correlationsPath points to correlations.jsonl', () => {
    expect(correlationsPath('/my/project')).toBe('/my/project/logs/deep-current/correlations.jsonl');
  });
});

describe('loadSituation', () => {
  it('returns null when situation file does not exist', async () => {
    const result = await loadSituation('/nonexistent');
    expect(result).toBeNull();
  });
});

describe('saveSituation', () => {
  it('creates directory and writes model', async () => {
    const { mkdir, writeFile } = await import('node:fs/promises');
    const model: SituationModel = {
      projectState: 'PARTIAL',
      projectName: 'test',
      lastScan: new Date().toISOString(),
      dimensions: {
        featureCompleteness: { score: 50, gaps: [], lastUpdated: '' },
        quality: { score: 50, gaps: [], lastUpdated: '' },
        performance: { score: 50, gaps: [], lastUpdated: '' },
        growthReadiness: { score: 50, gaps: [], lastUpdated: '' },
        revenuePotential: { score: 50, gaps: [], lastUpdated: '' },
      },
      campaignHistory: [],
      pendingProposals: [],
      averagePredictionAccuracy: 0,
      autonomyTier: 1,
    };

    await saveSituation('/test/project', model);
    expect(mkdir).toHaveBeenCalled();
    expect(writeFile).toHaveBeenCalled();
  });
});
