/**
 * Chakotay's Correlation Engine — connects product changes to metric outcomes (v12.2).
 *
 * Maintains an event log of product changes (campaigns, deploys) and metric
 * observations (traffic, conversions, revenue, performance scores). Computes
 * before/after comparisons to identify which changes drove which outcomes.
 *
 * PRD Reference: ROADMAP v12.2, DEEP_CURRENT.md LEARN step
 */

import { appendFile, readFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { correlationsPath, predictionsPath, deepCurrentDir } from './deep-current.js';
import { findProjectRoot } from './marker.js';
import type { CampaignProposal } from './campaign-proposer.js';

// ── Event Types ───────────────────────────────────────

interface ChangeEvent {
  type: 'campaign_complete' | 'deploy' | 'config_change';
  date: string;           // ISO 8601
  campaign?: string;      // Campaign name
  missions?: number;      // Number of missions
  dimension?: string;     // Which dimension was targeted
  description: string;
}

interface MetricObservation {
  type: 'metric';
  date: string;
  metric: string;         // e.g., 'lighthouse_performance', 'traffic_daily', 'conversion_rate'
  value: number;
  source: string;         // 'torres', 'vin', 'dockson'
}

interface Correlation {
  type: 'correlation';
  date: string;
  productChange: string;  // Campaign or change that caused the effect
  metric: string;         // Which metric changed
  valueBefore: number;
  valueAfter: number;
  delta: string;          // e.g., "+27", "-15%"
  confidence: 'high' | 'medium' | 'low';
  lagDays: number;        // How many days between change and metric shift
}

type EventLogEntry = ChangeEvent | MetricObservation | Correlation;

// ── Event Logging ─────────────────────────────────────

async function appendEvent(entry: EventLogEntry): Promise<void> {
  await mkdir(deepCurrentDir(findProjectRoot() ?? process.cwd()), { recursive: true });
  await appendFile(correlationsPath(findProjectRoot() ?? process.cwd()), JSON.stringify(entry) + '\n', 'utf-8');
}

export async function logCampaignComplete(name: string, missions: number, dimension: string): Promise<void> {
  await appendEvent({
    type: 'campaign_complete',
    date: new Date().toISOString(),
    campaign: name,
    missions,
    dimension,
    description: `Campaign "${name}" completed (${missions} missions, targeting ${dimension})`,
  });
}

export async function logMetric(metric: string, value: number, source: string): Promise<void> {
  await appendEvent({
    type: 'metric',
    date: new Date().toISOString(),
    metric,
    value,
    source,
  });
}

// ── Correlation Detection ─────────────────────────────

/**
 * Detect correlations between recent campaigns and metric changes.
 * Uses before/after comparison with configurable lag windows.
 */
export async function detectCorrelations(lagDays: number = 7): Promise<Correlation[]> {
  if (!existsSync(correlationsPath(findProjectRoot() ?? process.cwd()))) return [];

  const content = await readFile(correlationsPath(findProjectRoot() ?? process.cwd()), 'utf-8');
  const lines = content.trim().split('\n').filter(Boolean);
  const events: EventLogEntry[] = lines.map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean) as EventLogEntry[];

  const changes = events.filter(e => e.type === 'campaign_complete') as ChangeEvent[];
  const metrics = events.filter(e => e.type === 'metric') as MetricObservation[];
  const correlations: Correlation[] = [];

  for (const change of changes) {
    const changeDate = new Date(change.date).getTime();

    // Find metrics of the same type before and after the change
    const metricNames = [...new Set(metrics.map(m => m.metric))];

    for (const metricName of metricNames) {
      const metricsOfType = metrics.filter(m => m.metric === metricName);

      // Before: last metric reading before the change
      const before = metricsOfType
        .filter(m => new Date(m.date).getTime() < changeDate)
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0];

      // After: first metric reading lagDays after the change
      const afterCutoff = changeDate + lagDays * 24 * 60 * 60 * 1000;
      const after = metricsOfType
        .filter(m => {
          const t = new Date(m.date).getTime();
          return t > changeDate && t <= afterCutoff;
        })
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0];

      if (before && after && before.value !== after.value) {
        const delta = after.value - before.value;
        const pctChange = before.value !== 0 ? Math.round((delta / before.value) * 100) : 0;
        const significance = Math.abs(pctChange);

        // Only record meaningful changes (>5%)
        if (significance > 5) {
          const correlation: Correlation = {
            type: 'correlation',
            date: new Date().toISOString(),
            productChange: change.campaign || change.description,
            metric: metricName,
            valueBefore: before.value,
            valueAfter: after.value,
            delta: `${delta > 0 ? '+' : ''}${pctChange}%`,
            confidence: significance > 30 ? 'high' : significance > 15 ? 'medium' : 'low',
            lagDays,
          };
          correlations.push(correlation);
          await appendEvent(correlation); // Record the correlation in the log
        }
      }
    }
  }

  return correlations;
}

// ── Prediction Tracking ───────────────────────────────

interface PredictionRecord {
  proposalId: string;
  proposalName: string;
  predictedImpact: string;
  actualImpact?: string;
  accuracy?: number;        // 0-1
  recordedAt: string;
  evaluatedAt?: string;
}

export async function recordPrediction(proposal: CampaignProposal): Promise<void> {
  await mkdir(deepCurrentDir(findProjectRoot() ?? process.cwd()), { recursive: true });
  const record: PredictionRecord = {
    proposalId: proposal.id,
    proposalName: proposal.name,
    predictedImpact: proposal.expectedImpact,
    recordedAt: new Date().toISOString(),
  };
  await appendFile(predictionsPath(findProjectRoot() ?? process.cwd()), JSON.stringify(record) + '\n', 'utf-8');
}

export async function evaluatePrediction(
  proposalId: string,
  actualImpact: string,
  accuracy: number
): Promise<void> {
  // Read existing predictions, find the matching one, update it
  if (!existsSync(predictionsPath(findProjectRoot() ?? process.cwd()))) return;
  const content = await readFile(predictionsPath(findProjectRoot() ?? process.cwd()), 'utf-8');
  const lines = content.trim().split('\n').filter(Boolean);
  const updated = lines.map(line => {
    try {
      const record: PredictionRecord = JSON.parse(line);
      if (record.proposalId === proposalId) {
        record.actualImpact = actualImpact;
        record.accuracy = accuracy;
        record.evaluatedAt = new Date().toISOString();
      }
      return JSON.stringify(record);
    } catch { return line; }
  });
  const { writeFile: wf } = await import('node:fs/promises');
  await wf(predictionsPath(findProjectRoot() ?? process.cwd()), updated.join('\n') + '\n');
}

/**
 * Calculate average prediction accuracy across all evaluated predictions.
 */
export async function getAveragePredictionAccuracy(): Promise<number> {
  if (!existsSync(predictionsPath(findProjectRoot() ?? process.cwd()))) return 0;
  const content = await readFile(predictionsPath(findProjectRoot() ?? process.cwd()), 'utf-8');
  const records: PredictionRecord[] = content.trim().split('\n').filter(Boolean)
    .map(l => { try { return JSON.parse(l); } catch { return null; } })
    .filter(Boolean) as PredictionRecord[];

  const evaluated = records.filter(r => r.accuracy !== undefined);
  if (evaluated.length === 0) return 0;
  return evaluated.reduce((sum, r) => sum + (r.accuracy || 0), 0) / evaluated.length;
}

export type { ChangeEvent, MetricObservation, Correlation, PredictionRecord };
