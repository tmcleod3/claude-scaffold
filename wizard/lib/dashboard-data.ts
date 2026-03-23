/**
 * Dashboard data parsers — shared between Danger Room and War Room.
 * Reads campaign-state.md, assemble-state.md, log files, deploy logs, VERSION.md.
 *
 * Parser fixes from field reports #127, #128:
 * - parseCampaignState: rewritten for actual 5-column format, handles bold status
 * - parseBuildState: explicit trim to remove capture artifacts
 * - parseFindings: reads Known Issues from build-state.md first, falls back to regex
 */

import { readdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { homedir } from 'node:os';
import { readFileOrNull } from './http-helpers.js';

const PROJECT_ROOT = resolve(join(import.meta.dirname, '..', '..'));
const LOGS_DIR = join(PROJECT_ROOT, 'logs');
const VOIDFORGE_DIR = join(homedir(), '.voidforge');

// ── Types ────────────────────────────────────

export interface Mission {
  name: string;
  status: string;
  number: number;
  blockedBy?: string;
  debrief?: string;
}

export interface CampaignData {
  missions: Mission[];
  status: string;
  sections: Array<{ name: string; status: string }>;
}

export interface PhaseData {
  phases: Array<{ name: string; status: string }>;
}

export interface FindingCounts {
  critical: number;
  high: number;
  medium: number;
  low: number;
}

export interface DeployData {
  url: string;
  healthy: boolean;
  target: string;
  timestamp: string;
}

// ── Parsers ──────────────────────────────────

/**
 * Parse campaign-state.md into structured campaign data.
 *
 * Handles the actual format written by /campaign:
 *   | # | Mission | Scope | Status | Debrief |
 *   | 1 | Name    | ...   | NOT STARTED | — |
 *
 * Status values may be wrapped in bold: **DONE**, **COMPLETE**
 * Normalizes to: COMPLETE, ACTIVE, BLOCKED, PENDING, STRUCTURAL
 */
export async function parseCampaignState(): Promise<CampaignData | null> {
  const content = await readFileOrNull(join(LOGS_DIR, 'campaign-state.md'));
  if (!content) return null;

  const missions: Mission[] = [];
  // Match 5-column table rows: | # | name | scope | status | debrief |
  // Status may be wrapped in ** for bold markdown
  const re = /\|\s*(\d+)\s*\|\s*(.+?)\s*\|\s*(.+?)\s*\|\s*\*{0,2}(COMPLETE|DONE|IN PROGRESS|NOT STARTED|BLOCKED|STRUCTURAL|ACTIVE|ABANDONED)\*{0,2}\s*\|\s*(.+?)\s*\|/g;
  let m;
  while ((m = re.exec(content)) !== null) {
    const rawStatus = m[4].trim();
    // Normalize: DONE→COMPLETE, IN PROGRESS→ACTIVE, NOT STARTED→PENDING
    const status = rawStatus === 'IN PROGRESS' ? 'ACTIVE'
      : rawStatus === 'NOT STARTED' ? 'PENDING'
      : rawStatus === 'DONE' ? 'COMPLETE'
      : rawStatus;
    missions.push({
      name: m[2].trim(),
      status,
      number: parseInt(m[1]),
      debrief: m[5].trim() === '—' ? undefined : m[5].trim(),
    });
  }

  if (missions.length === 0) {
    // Defensive: warn if file has content but no missions parsed
    if (content.length > 100) {
      console.warn('parseCampaignState: no missions found in non-empty file (%d chars)', content.length);
    }
    return null;
  }

  const statusMatch = content.match(/CAMPAIGN STATUS:\s*(.+?)(?:\n|$)/);
  const status = statusMatch ? statusMatch[1] : 'ACTIVE';
  const sections = missions.map(mi => ({ name: mi.name, status: mi.status }));

  return { missions, status, sections };
}

/**
 * Parse assemble-state.md into phase pipeline data.
 * Explicit trim on captures to remove leading artifacts.
 */
export async function parseBuildState(): Promise<PhaseData | null> {
  const content = await readFileOrNull(join(LOGS_DIR, 'assemble-state.md'));
  if (!content) return null;

  const phases: Array<{ name: string; status: string }> = [];
  const re = /\|\s*(?:\d+\.\s*)?(.+?)\s*\|\s*(COMPLETE|IN PROGRESS|NOT STARTED|PENDING|SKIPPED)\s*\|/g;
  let m;
  while ((m = re.exec(content)) !== null) {
    // Explicit trim + artifact removal
    const name = m[1].trim().replace(/^\|\s*/, '');
    if (name === 'Phase' || name === 'Status' || name.startsWith('-') || name === '') continue;
    const raw = m[2].trim();
    const normalized = raw === 'IN PROGRESS' ? 'active' : raw === 'NOT STARTED' ? 'pending' : raw.toLowerCase();
    phases.push({ name, status: normalized });
  }

  return phases.length > 0 ? { phases } : null;
}

function countSeverity(content: string, severity: string): number {
  const tableHits = (content.match(new RegExp(`\\|\\s*${severity}\\s*\\|`, 'gi')) || []).length;
  const boldHits = (content.match(new RegExp(`\\*\\*${severity}\\*\\*`, 'gi')) || []).length;
  return tableHits + boldHits;
}

/**
 * Parse findings — prefer Known Issues from build-state.md (curated, reflects open issues only).
 * Falls back to regex counting across log files (historical totals, may overcount).
 */
export async function parseFindings(): Promise<FindingCounts> {
  const counts: FindingCounts = { critical: 0, high: 0, medium: 0, low: 0 };

  // Preferred: read Known Issues from build-state.md
  const buildState = await readFileOrNull(join(LOGS_DIR, 'build-state.md'));
  if (buildState) {
    const knownIssuesMatch = buildState.match(/## Known Issues[\s\S]*?(?=\n## |\n---|$)/);
    if (knownIssuesMatch) {
      const section = knownIssuesMatch[0];
      counts.critical = countSeverity(section, 'CRITICAL');
      counts.high = countSeverity(section, 'HIGH');
      counts.medium = countSeverity(section, 'MEDIUM');
      counts.low = countSeverity(section, 'LOW');
      return counts;
    }
  }

  // Fallback: count across all log files (historical — may include fixed findings)
  try {
    const files = await readdir(LOGS_DIR);
    const logFiles = files.filter(f => f.startsWith('phase-') || f === 'gauntlet-state.md');
    for (const file of logFiles) {
      const content = await readFileOrNull(join(LOGS_DIR, file));
      if (!content) continue;
      counts.critical += countSeverity(content, 'CRITICAL');
      counts.high += countSeverity(content, 'HIGH');
      counts.medium += countSeverity(content, 'MEDIUM');
      counts.low += countSeverity(content, 'LOW');
    }
  } catch { /* no logs directory */ }
  return counts;
}

/** Read deploy log from logs or .voidforge directory. */
export async function readDeployLog(): Promise<DeployData | null> {
  const paths = [
    join(LOGS_DIR, 'deploy-log.json'),
    join(VOIDFORGE_DIR, 'deploys', 'latest.json'),
  ];
  for (const p of paths) {
    const content = await readFileOrNull(p);
    if (!content) continue;
    try {
      const data = JSON.parse(content) as Record<string, unknown>;
      return {
        url: String(data.url || ''),
        healthy: Boolean(data.healthy),
        target: String(data.target || ''),
        timestamp: String(data.timestamp || ''),
      };
    } catch { continue; }
  }
  return null;
}

/** Read current version from VERSION.md. */
export async function readVersion(): Promise<{ version: string; branch: string }> {
  const content = await readFileOrNull(join(PROJECT_ROOT, 'VERSION.md'));
  if (!content) return { version: 'unknown', branch: 'unknown' };
  const match = content.match(/\*\*Current:\*\*\s*([\d.]+)/);
  return { version: match ? match[1] : 'unknown', branch: 'main' };
}

// ── Context Stats (Status Line Bridge) ──────

export interface ContextStats {
  percent: number | null;
  tokens: number | null;
  output_tokens: number | null;
  window_size: number | null;
  model: string | null;
  cost: number | null;
  session_id: string | null;
  updated_at: number | null;
}

const STALENESS_THRESHOLD_MS = 60000; // 60 seconds

/**
 * Read context stats from the Status Line bridge.
 * Reads per-session files (~/.voidforge/context-stats-*.json) and returns the most recent.
 * Returns null if no data exists or all data is stale (>60s old).
 */
export async function readContextStats(): Promise<ContextStats | null> {
  try {
    const { readdir: listDir } = await import('node:fs/promises');
    const files = await listDir(VOIDFORGE_DIR);
    const statsFiles = files.filter(f => f.startsWith('context-stats-') && f.endsWith('.json'));
    if (statsFiles.length === 0) return null;

    let mostRecent: ContextStats | null = null;
    let latestTime = 0;
    const now = Date.now() / 1000; // jq's `now` outputs Unix seconds

    for (const file of statsFiles) {
      const content = await readFileOrNull(join(VOIDFORGE_DIR, file));
      if (!content) continue;
      try {
        const data = JSON.parse(content) as ContextStats;
        if (data.updated_at && data.updated_at > latestTime) {
          // Check staleness — skip files older than 60 seconds
          if (now - data.updated_at > STALENESS_THRESHOLD_MS / 1000) continue;
          latestTime = data.updated_at;
          mostRecent = data;
        }
      } catch { continue; }
    }

    return mostRecent;
  } catch {
    return null;
  }
}

// ── Tests Panel ──────────────────────────

export interface TestResults {
  passed: number;
  failed: number;
  total: number;
  duration_ms?: number;
  last_run?: string;
  failures?: Array<{ name: string; message: string }>;
}

/**
 * Read test results from test-results.json (written by test runner or hook).
 */
export async function readTestResults(): Promise<TestResults | null> {
  const paths = [
    join(PROJECT_ROOT, 'test-results.json'),
    join(LOGS_DIR, 'test-results.json'),
  ];
  for (const p of paths) {
    const content = await readFileOrNull(p);
    if (!content) continue;
    try {
      const data = JSON.parse(content) as TestResults;
      if (typeof data.total === 'number') return data;
    } catch { continue; }
  }
  return null;
}

// ── Project-Specific Panels (config-driven) ──

export interface DangerRoomConfig {
  health_endpoint?: string;
  pm2_process?: string;
  panels?: string[];
}

/**
 * Read danger-room.config.json for project-specific panel settings.
 */
export async function readDashboardConfig(): Promise<DangerRoomConfig> {
  const paths = [
    join(PROJECT_ROOT, 'wizard', 'danger-room.config.json'),
    join(PROJECT_ROOT, 'danger-room.config.json'),
  ];
  for (const p of paths) {
    const content = await readFileOrNull(p);
    if (!content) continue;
    try { return JSON.parse(content) as DangerRoomConfig; } catch { continue; }
  }
  return {};
}

/**
 * Read git status for the Git Status panel.
 */
export async function readGitStatus(): Promise<{
  branch: string;
  uncommitted: number;
  ahead: number;
  behind: number;
  lastCommit: string;
} | null> {
  try {
    const { execFile } = await import('node:child_process');
    const { promisify } = await import('node:util');
    const exec = promisify(execFile);

    const [branchResult, statusResult, logResult] = await Promise.all([
      exec('git', ['branch', '--show-current'], { cwd: PROJECT_ROOT, timeout: 5000 }).catch(() => ({ stdout: 'unknown' })),
      exec('git', ['status', '--porcelain'], { cwd: PROJECT_ROOT, timeout: 5000 }).catch(() => ({ stdout: '' })),
      exec('git', ['log', '--oneline', '-1'], { cwd: PROJECT_ROOT, timeout: 5000 }).catch(() => ({ stdout: '—' })),
    ]);

    const branch = branchResult.stdout.trim() || 'unknown';
    const uncommitted = statusResult.stdout.trim().split('\n').filter(Boolean).length;
    const lastCommit = logResult.stdout.trim();

    // Ahead/behind — may fail if no upstream is set
    let ahead = 0;
    let behind = 0;
    try {
      const abResult = await exec('git', ['rev-list', '--count', '--left-right', `origin/${branch}...HEAD`], { cwd: PROJECT_ROOT, timeout: 5000 });
      const parts = abResult.stdout.trim().split('\t');
      if (parts.length === 2) {
        behind = parseInt(parts[0]) || 0;
        ahead = parseInt(parts[1]) || 0;
      }
    } catch { /* no upstream — normal for some branches */ }

    return { branch, uncommitted, ahead, behind, lastCommit };
  } catch {
    return null;
  }
}

/** Export paths for modules that need direct access. */
export { PROJECT_ROOT, LOGS_DIR, VOIDFORGE_DIR };
