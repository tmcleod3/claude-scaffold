/**
 * Build analytics — tracks metrics across projects for trend analysis.
 * Stored at ~/.voidforge/analytics.json. No external dependencies.
 *
 * Wong guards the knowledge. The Sanctum grows.
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir } from 'node:os';

const ANALYTICS_DIR = join(homedir(), '.voidforge');
const ANALYTICS_FILE = join(ANALYTICS_DIR, 'analytics.json');

export interface PhaseMetric {
  phase: string;
  findingsCount: number;
  fixesApplied: number;
  /** Duration in seconds (optional — only if measurable) */
  durationSeconds?: number;
}

export interface BuildRecord {
  projectName: string;
  framework: string;
  database: string;
  deployTarget: string;
  timestamp: string;
  version: string;
  phases: PhaseMetric[];
  totalFindings: number;
  totalFixes: number;
  testCount?: number;
  lessonsExtracted: number;
}

export interface AnalyticsStore {
  builds: BuildRecord[];
}

async function ensureDir(): Promise<void> {
  try {
    await mkdir(ANALYTICS_DIR, { recursive: true });
  } catch { /* exists */ }
}

async function loadStore(): Promise<AnalyticsStore> {
  try {
    const raw = await readFile(ANALYTICS_FILE, 'utf-8');
    return JSON.parse(raw) as AnalyticsStore;
  } catch {
    return { builds: [] };
  }
}

async function saveStore(store: AnalyticsStore): Promise<void> {
  await ensureDir();
  await writeFile(ANALYTICS_FILE, JSON.stringify(store, null, 2), 'utf-8');
}

/** Record a completed build. */
export async function recordBuild(record: BuildRecord): Promise<void> {
  const store = await loadStore();
  store.builds.push(record);
  // Keep last 100 builds to prevent unbounded growth
  if (store.builds.length > 100) {
    store.builds = store.builds.slice(-100);
  }
  await saveStore(store);
}

/** Surface trends across past builds. Returns human-readable insights. */
export async function surfaceTrends(currentFramework?: string): Promise<string[]> {
  const store = await loadStore();
  const builds = store.builds;
  if (builds.length < 2) return [];

  const insights: string[] = [];

  // Finding hotspots — which phases consistently produce the most findings?
  const phaseFindings: Record<string, number[]> = {};
  for (const build of builds) {
    for (const phase of build.phases) {
      if (!phaseFindings[phase.phase]) phaseFindings[phase.phase] = [];
      phaseFindings[phase.phase].push(phase.findingsCount);
    }
  }

  for (const [phase, counts] of Object.entries(phaseFindings)) {
    const avg = counts.reduce((a, b) => a + b, 0) / counts.length;
    if (avg > 5 && counts.length >= 2) {
      insights.push(`Phase "${phase}" averages ${avg.toFixed(1)} findings across ${counts.length} builds — consider proactive checks in earlier phases.`);
    }
  }

  // Framework-specific patterns
  if (currentFramework) {
    const frameworkBuilds = builds.filter(b => b.framework === currentFramework);
    if (frameworkBuilds.length >= 2) {
      const avgFindings = frameworkBuilds.reduce((a, b) => a + b.totalFindings, 0) / frameworkBuilds.length;
      insights.push(`Your ${currentFramework} projects average ${avgFindings.toFixed(0)} findings per build (${frameworkBuilds.length} builds).`);
    }
  }

  // Fix-to-finding ratio trend
  const ratios = builds.map(b => b.totalFindings > 0 ? b.totalFixes / b.totalFindings : 1);
  const recentRatios = ratios.slice(-5);
  const avgRatio = recentRatios.reduce((a, b) => a + b, 0) / recentRatios.length;
  if (avgRatio < 0.8) {
    insights.push(`Fix-to-finding ratio is ${(avgRatio * 100).toFixed(0)}% — some findings are being deferred. Consider addressing all findings in each build.`);
  }

  // Lessons trend
  const totalLessons = builds.reduce((a, b) => a + b.lessonsExtracted, 0);
  if (totalLessons > 0) {
    insights.push(`${totalLessons} lessons extracted across ${builds.length} builds. The forge is learning.`);
  }

  return insights;
}

/** Get a summary of all recorded builds. */
export async function getBuildHistory(): Promise<{ count: number; frameworks: string[]; latestBuild: string | null }> {
  const store = await loadStore();
  const frameworks = [...new Set(store.builds.map(b => b.framework))];
  const latest = store.builds.length > 0 ? store.builds[store.builds.length - 1].timestamp : null;
  return { count: store.builds.length, frameworks, latestBuild: latest };
}
