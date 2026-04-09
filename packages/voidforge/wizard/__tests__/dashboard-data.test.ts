/**
 * Tests for dashboard-data.ts — Dashboard parser functions.
 * v22.0.x P2-A: Zero-coverage gap identified by Batman + Constantine.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, writeFile, mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  parseCampaignState,
  parseBuildState,
  parseFindings,
  readDeployLog,
  readVersion,
  readTestResults,
  readGitStatus,
  readDashboardConfig,
} from '../lib/dashboard-data.js';

let tempDir: string;
let logsDir: string;

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), 'vf-test-'));
  logsDir = join(tempDir, 'logs');
  await mkdir(logsDir, { recursive: true });
});

afterEach(async () => {
  await rm(tempDir, { recursive: true, force: true });
});

describe('parseCampaignState', () => {
  it('returns null when no campaign-state.md exists', async () => {
    expect(await parseCampaignState(logsDir)).toBeNull();
  });

  it('parses campaign missions from table format', async () => {
    const content = `# Campaign State

| # | Mission | Scope | Status | Debrief |
|---|---------|-------|--------|---------|
| 1 | Router Upgrade | M0 | **COMPLETE** | #100 |
| 2 | Dashboard Data | M1 | IN PROGRESS | — |
| 3 | Daemon State | M2 | NOT STARTED | — |

CAMPAIGN STATUS: ACTIVE
`;
    await writeFile(join(logsDir, 'campaign-state.md'), content);

    const result = await parseCampaignState(logsDir);
    expect(result).not.toBeNull();
    expect(result!.missions).toHaveLength(3);
    expect(result!.missions[0].name).toBe('Router Upgrade');
    expect(result!.missions[0].status).toBe('COMPLETE');
    expect(result!.missions[0].number).toBe(1);
    expect(result!.missions[1].status).toBe('ACTIVE');
    expect(result!.missions[2].status).toBe('PENDING');
    expect(result!.status).toBe('ACTIVE');
  });

  it('normalizes DONE to COMPLETE and NOT STARTED to PENDING', async () => {
    const content = `| 1 | Test | Scope | DONE | — |`;
    await writeFile(join(logsDir, 'campaign-state.md'), content);
    const result = await parseCampaignState(logsDir);
    expect(result!.missions[0].status).toBe('COMPLETE');
  });
});

describe('parseBuildState', () => {
  it('returns null when no assemble-state.md exists', async () => {
    expect(await parseBuildState(logsDir)).toBeNull();
  });

  it('parses build phases from table', async () => {
    const content = `| Architecture | COMPLETE |
| Build | IN PROGRESS |
| Review | NOT STARTED |`;
    await writeFile(join(logsDir, 'assemble-state.md'), content);

    const result = await parseBuildState(logsDir);
    expect(result).not.toBeNull();
    expect(result!.phases).toHaveLength(3);
    expect(result!.phases[0].status).toBe('complete');
    expect(result!.phases[1].status).toBe('active');
    expect(result!.phases[2].status).toBe('pending');
  });
});

describe('parseFindings', () => {
  it('returns zeroes when no logs exist', async () => {
    const counts = await parseFindings(logsDir);
    expect(counts).toEqual({ critical: 0, high: 0, medium: 0, low: 0 });
  });

  it('counts severities from build-state Known Issues', async () => {
    const content = `## Known Issues

| Finding | Severity |
|---------|----------|
| Bug A | CRITICAL |
| Bug B | HIGH |
| Bug C | HIGH |
| Bug D | MEDIUM |

## Other Section
`;
    await writeFile(join(logsDir, 'build-state.md'), content);

    const counts = await parseFindings(logsDir);
    expect(counts.critical).toBe(1);
    expect(counts.high).toBe(2);
    expect(counts.medium).toBe(1);
    expect(counts.low).toBe(0);
  });
});

describe('readDeployLog', () => {
  it('returns null when no deploy log exists', async () => {
    expect(await readDeployLog(logsDir)).toBeNull();
  });

  it('reads JSON deploy log', async () => {
    const data = { url: 'https://app.example.com', healthy: true, target: 'vps', timestamp: '2026-04-09' };
    await writeFile(join(logsDir, 'deploy-log.json'), JSON.stringify(data));

    const result = await readDeployLog(logsDir);
    expect(result).not.toBeNull();
    expect(result!.url).toBe('https://app.example.com');
    expect(result!.healthy).toBe(true);
  });
});

describe('readVersion', () => {
  it('returns unknown when no VERSION.md exists', async () => {
    const result = await readVersion(tempDir);
    expect(result.version).toBe('unknown');
  });

  it('extracts version from VERSION.md', async () => {
    await writeFile(join(tempDir, 'VERSION.md'), '**Current:** 22.0.1\n');
    const result = await readVersion(tempDir);
    expect(result.version).toBe('22.0.1');
  });
});

describe('readTestResults', () => {
  it('returns null when no test-results.json exists', async () => {
    expect(await readTestResults(tempDir, logsDir)).toBeNull();
  });

  it('reads test results from project root', async () => {
    const data = { passed: 670, failed: 5, total: 675 };
    await writeFile(join(tempDir, 'test-results.json'), JSON.stringify(data));

    const result = await readTestResults(tempDir, logsDir);
    expect(result).not.toBeNull();
    expect(result!.total).toBe(675);
    expect(result!.failed).toBe(5);
  });
});

describe('readDashboardConfig', () => {
  it('returns empty object when no config exists', async () => {
    expect(await readDashboardConfig(tempDir)).toEqual({});
  });

  it('reads config from project root', async () => {
    const config = { health_endpoint: '/api/health', panels: ['campaign', 'deploy'] };
    await writeFile(join(tempDir, 'danger-room.config.json'), JSON.stringify(config));

    const result = await readDashboardConfig(tempDir);
    expect(result.health_endpoint).toBe('/api/health');
    expect(result.panels).toEqual(['campaign', 'deploy']);
  });
});
