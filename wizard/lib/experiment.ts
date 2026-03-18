/**
 * Methodology A/B Testing — run two protocol variants on the same code and compare.
 *
 * Tracks per-agent true-positive rates across projects. Over time, tunes the
 * methodology based on data, not intuition. Wong manages the experiments.
 *
 * Storage: ~/.voidforge/experiments.json
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { randomUUID } from 'node:crypto';

const EXPERIMENTS_DIR = join(homedir(), '.voidforge');
const EXPERIMENTS_FILE = join(EXPERIMENTS_DIR, 'experiments.json');

// ── Types ───────────────────────────────────────

export interface ExperimentVariant {
  name: string;
  description: string;
  agentCount: number;
  phases: string[];
}

export interface ExperimentResult {
  variantName: string;
  findings: number;
  truePositives: number;
  falsePositives: number;
  contextTokens: number;
  durationMs: number;
  agentResults: AgentResult[];
}

export interface AgentResult {
  agent: string;
  universe: string;
  findings: number;
  truePositives: number;
  falsePositives: number;
  confidence: number;
}

export type ExperimentStatus = 'planned' | 'running' | 'complete' | 'cancelled';

export interface Experiment {
  id: string;
  name: string;
  description: string;
  project: string;
  domain: string;
  status: ExperimentStatus;
  createdAt: string;
  completedAt: string | null;
  variantA: ExperimentVariant;
  variantB: ExperimentVariant;
  resultA: ExperimentResult | null;
  resultB: ExperimentResult | null;
  winner: 'A' | 'B' | 'tie' | null;
  winReason: string | null;
}

export interface ExperimentStore {
  version: 1;
  experiments: Experiment[];
}

// ── Storage ─────────────────────────────────────

async function ensureDir(): Promise<void> {
  try { await mkdir(EXPERIMENTS_DIR, { recursive: true }); } catch { /* exists */ }
}

async function readStore(): Promise<ExperimentStore> {
  try {
    const content = await readFile(EXPERIMENTS_FILE, 'utf-8');
    const data = JSON.parse(content) as ExperimentStore;
    if (data.version === 1 && Array.isArray(data.experiments)) return data;
  } catch { /* missing or corrupt */ }
  return { version: 1, experiments: [] };
}

async function writeStore(store: ExperimentStore): Promise<void> {
  await ensureDir();
  await writeFile(EXPERIMENTS_FILE, JSON.stringify(store, null, 2), 'utf-8');
}

// ── API ─────────────────────────────────────────

/** Create a new experiment. */
export async function createExperiment(
  name: string,
  description: string,
  project: string,
  domain: string,
  variantA: ExperimentVariant,
  variantB: ExperimentVariant,
): Promise<Experiment> {
  const store = await readStore();
  const experiment: Experiment = {
    id: randomUUID(),
    name,
    description,
    project,
    domain,
    status: 'planned',
    createdAt: new Date().toISOString(),
    completedAt: null,
    variantA,
    variantB,
    resultA: null,
    resultB: null,
    winner: null,
    winReason: null,
  };
  store.experiments.push(experiment);
  await writeStore(store);
  return experiment;
}

/** Record the result of running a variant. */
export async function recordResult(
  experimentId: string,
  variant: 'A' | 'B',
  result: ExperimentResult,
): Promise<Experiment | null> {
  const store = await readStore();
  const experiment = store.experiments.find(e => e.id === experimentId);
  if (!experiment) return null;

  if (variant === 'A') experiment.resultA = result;
  else experiment.resultB = result;

  // Auto-evaluate if both results are in
  if (experiment.resultA && experiment.resultB) {
    experiment.status = 'complete';
    experiment.completedAt = new Date().toISOString();
    const evaluation = evaluate(experiment.resultA, experiment.resultB);
    experiment.winner = evaluation.winner;
    experiment.winReason = evaluation.reason;
  } else {
    experiment.status = 'running';
  }

  await writeStore(store);
  return experiment;
}

/** List all experiments, optionally filtered by status or project. */
export async function listExperiments(filter?: {
  status?: ExperimentStatus;
  project?: string;
}): Promise<Experiment[]> {
  const store = await readStore();
  let results = store.experiments;
  if (filter?.status) results = results.filter(e => e.status === filter.status);
  if (filter?.project) results = results.filter(e => e.project === filter.project);
  return results;
}

/** Get a single experiment by ID. */
export async function getExperiment(id: string): Promise<Experiment | null> {
  const store = await readStore();
  return store.experiments.find(e => e.id === id) ?? null;
}

/** Get aggregate per-agent accuracy stats across all completed experiments. */
export async function getAgentStats(): Promise<Map<string, { experiments: number; truePositives: number; falsePositives: number; avgConfidence: number }>> {
  const store = await readStore();
  const stats = new Map<string, { experiments: number; truePositives: number; falsePositives: number; totalConfidence: number }>();

  for (const exp of store.experiments) {
    if (exp.status !== 'complete') continue;
    const allResults = [exp.resultA, exp.resultB].filter(Boolean) as ExperimentResult[];
    for (const result of allResults) {
      for (const ar of result.agentResults) {
        const existing = stats.get(ar.agent) ?? { experiments: 0, truePositives: 0, falsePositives: 0, totalConfidence: 0 };
        existing.experiments++;
        existing.truePositives += ar.truePositives;
        existing.falsePositives += ar.falsePositives;
        existing.totalConfidence += ar.confidence;
        stats.set(ar.agent, existing);
      }
    }
  }

  const result = new Map<string, { experiments: number; truePositives: number; falsePositives: number; avgConfidence: number }>();
  for (const [agent, s] of stats) {
    result.set(agent, {
      experiments: s.experiments,
      truePositives: s.truePositives,
      falsePositives: s.falsePositives,
      avgConfidence: s.experiments > 0 ? Math.round(s.totalConfidence / s.experiments) : 0,
    });
  }
  return result;
}

// ── Evaluation ──────────────────────────────────

interface EvaluationResult {
  winner: 'A' | 'B' | 'tie';
  reason: string;
}

function evaluate(resultA: ExperimentResult, resultB: ExperimentResult): EvaluationResult {
  // Primary metric: true positive rate (findings that are real issues)
  const tprA = resultA.findings > 0 ? resultA.truePositives / resultA.findings : 0;
  const tprB = resultB.findings > 0 ? resultB.truePositives / resultB.findings : 0;

  // Secondary metric: context efficiency (true positives per 1000 tokens)
  const effA = resultA.contextTokens > 0 ? (resultA.truePositives / resultA.contextTokens) * 1000 : 0;
  const effB = resultB.contextTokens > 0 ? (resultB.truePositives / resultB.contextTokens) * 1000 : 0;

  const tprDiff = Math.abs(tprA - tprB);
  const SIGNIFICANCE_THRESHOLD = 0.1; // 10% difference is significant

  if (tprDiff < SIGNIFICANCE_THRESHOLD) {
    // Similar accuracy — decide on efficiency
    if (Math.abs(effA - effB) < 0.01) {
      return { winner: 'tie', reason: `Similar accuracy (${(tprA * 100).toFixed(0)}% vs ${(tprB * 100).toFixed(0)}%) and similar context efficiency` };
    }
    const moreEfficient = effA > effB ? 'A' : 'B';
    return { winner: moreEfficient, reason: `Similar accuracy but ${moreEfficient} is more context-efficient (${(effA * 100).toFixed(1)} vs ${(effB * 100).toFixed(1)} TP/1k tokens)` };
  }

  const moreAccurate = tprA > tprB ? 'A' : 'B';
  return { winner: moreAccurate, reason: `${moreAccurate} has higher true-positive rate (${((moreAccurate === 'A' ? tprA : tprB) * 100).toFixed(0)}% vs ${((moreAccurate === 'A' ? tprB : tprA) * 100).toFixed(0)}%)` };
}
