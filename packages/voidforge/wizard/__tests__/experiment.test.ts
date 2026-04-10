/**
 * Experiment A/B testing — evaluation logic tests.
 * Tier 1: Pure evaluation logic (no filesystem).
 * Tier 2: CRUD with mocked filesystem.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock filesystem for store operations
vi.mock('node:fs/promises', () => ({
  readFile: vi.fn(() => Promise.reject(Object.assign(new Error('ENOENT'), { code: 'ENOENT' }))),
  writeFile: vi.fn(() => Promise.resolve()),
  mkdir: vi.fn(() => Promise.resolve()),
  rename: vi.fn(() => Promise.resolve()),
  open: vi.fn(() => Promise.resolve({
    writeFile: vi.fn(() => Promise.resolve()),
    sync: vi.fn(() => Promise.resolve()),
    close: vi.fn(() => Promise.resolve()),
  })),
}));

import {
  createExperiment,
  recordResult,
  listExperiments,
  getExperiment,
  getAgentStats,
} from '../lib/experiment.js';
import type { ExperimentVariant, ExperimentResult } from '../lib/experiment.js';

function makeVariant(name: string): ExperimentVariant {
  return {
    name,
    description: `Variant ${name}`,
    agentCount: 3,
    phases: ['qa', 'security'],
  };
}

function makeResult(
  variantName: string,
  findings: number,
  truePositives: number,
  falsePositives: number,
): ExperimentResult {
  return {
    variantName,
    findings,
    truePositives,
    falsePositives,
    contextTokens: 10000,
    durationMs: 5000,
    agentResults: [
      { agent: 'Batman', universe: 'dc', findings, truePositives, falsePositives, confidence: 85 },
    ],
  };
}

describe('createExperiment', () => {
  it('creates an experiment with UUID and planned status', async () => {
    const exp = await createExperiment(
      'Test Experiment',
      'Testing A vs B',
      'my-project',
      'qa',
      makeVariant('A'),
      makeVariant('B'),
    );
    expect(exp.id).toBeTruthy();
    expect(exp.status).toBe('planned');
    expect(exp.winner).toBeNull();
    expect(exp.resultA).toBeNull();
    expect(exp.resultB).toBeNull();
  });
});

describe('recordResult', () => {
  it('returns null for non-existent experiment', async () => {
    const result = await recordResult('nonexistent-id', 'A', makeResult('A', 10, 8, 2));
    expect(result).toBeNull();
  });
});

describe('listExperiments', () => {
  it('returns empty array when store is empty', async () => {
    const experiments = await listExperiments();
    expect(experiments).toEqual([]);
  });
});

describe('getAgentStats', () => {
  it('returns empty map when no experiments exist', async () => {
    const stats = await getAgentStats();
    expect(stats.size).toBe(0);
  });
});
