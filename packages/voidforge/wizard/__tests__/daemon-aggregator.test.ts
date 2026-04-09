import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { join } from 'node:path';
import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { DaemonAggregator } from '../lib/daemon-aggregator.js';

describe('daemon-aggregator', () => {
  let aggregator: DaemonAggregator;

  beforeEach(() => {
    aggregator = new DaemonAggregator(60000); // Long interval so no auto-poll
  });

  afterEach(() => {
    aggregator.stop();
  });

  it('creates an aggregator instance', () => {
    expect(aggregator).toBeDefined();
  });

  it('returns empty status with no projects', () => {
    const status = aggregator.getStatus();
    expect(status.projects).toEqual([]);
    expect(status.totals.onlineCount).toBe(0);
    expect(status.totals.offlineCount).toBe(0);
    expect(status.totals.totalSpendCents).toBe(0);
    expect(status.totals.combinedRoas).toBe(0);
  });

  it('returns undefined for unknown project', () => {
    const status = aggregator.getProjectStatus('nonexistent');
    expect(status).toBeUndefined();
  });

  it('freeze returns empty when no projects', async () => {
    const result = await aggregator.freeze();
    expect(result.frozen).toEqual([]);
    expect(result.failed).toEqual([]);
  });

  it('unfreeze returns empty when no projects', async () => {
    const result = await aggregator.unfreeze();
    expect(result.unfrozen).toEqual([]);
    expect(result.failed).toEqual([]);
  });

  it('aggregated status includes lastPoll timestamp', () => {
    const status = aggregator.getStatus();
    expect(status.lastPoll).toBeDefined();
    const ts = new Date(status.lastPoll).getTime();
    expect(ts).toBeGreaterThan(0);
  });
});
