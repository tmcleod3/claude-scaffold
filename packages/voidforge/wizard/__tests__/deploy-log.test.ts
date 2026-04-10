/**
 * Deploy log tests — structured deploy logging, listing, and file persistence.
 * Uses a temp directory to avoid writing to real ~/.voidforge.
 */

import { describe, it, expect, vi, afterAll, beforeEach } from 'vitest';
import { join } from 'node:path';
import { readFile, rm, readdir } from 'node:fs/promises';
import { createTempHome, cleanupTempHome } from './helpers/temp-dir.js';

// Create temp dir BEFORE mock
const tempDir = await createTempHome();

vi.mock('node:os', async (importOriginal) => {
  const original = await importOriginal<typeof import('node:os')>();
  return { ...original, homedir: () => tempDir };
});

const { logDeploy, listDeploys } = await import('../lib/deploy-log.js');

afterAll(async () => {
  await cleanupTempHome(tempDir);
});

beforeEach(async () => {
  // Clean deploys dir between tests
  const deploysDir = join(tempDir, '.voidforge', 'deploys');
  try {
    const files = await readdir(deploysDir);
    for (const f of files) {
      await rm(join(deploysDir, f), { force: true });
    }
  } catch {
    // Dir may not exist yet
  }
});

function makeEntry(overrides: Partial<Parameters<typeof logDeploy>[0]> = {}) {
  return {
    runId: 'run-abc123',
    timestamp: new Date().toISOString(),
    target: 'vps',
    projectName: 'my-app',
    framework: 'next.js',
    deployUrl: 'https://my-app.com',
    hostname: 'my-app.com',
    region: 'us-east-1',
    resources: [{ type: 'ec2-instance', id: 'i-abc' }],
    outputs: { SSH_HOST: '1.2.3.4' },
    ...overrides,
  };
}

describe('logDeploy', () => {
  it('writes a deploy log file and returns path', async () => {
    const filepath = await logDeploy(makeEntry());
    expect(filepath).toContain('.json');
    expect(filepath).toContain('vps');

    const content = await readFile(filepath, 'utf-8');
    const parsed = JSON.parse(content);
    expect(parsed.runId).toBe('run-abc123');
    expect(parsed.projectName).toBe('my-app');
  });

  it('creates deploy directory if it does not exist', async () => {
    const deploysDir = join(tempDir, '.voidforge', 'deploys');
    await rm(deploysDir, { recursive: true, force: true });

    const filepath = await logDeploy(makeEntry());
    expect(filepath).toBeTruthy();
  });
});

describe('listDeploys', () => {
  it('returns empty array when no deploys exist', async () => {
    const entries = await listDeploys();
    expect(entries).toEqual([]);
  });

  it('returns logged deploys sorted by filename (newest first)', async () => {
    await logDeploy(makeEntry({ runId: 'run-1', target: 'vps' }));
    // Wait 1.1s so the second-level timestamp in the filename differs
    await new Promise(r => setTimeout(r, 1100));
    await logDeploy(makeEntry({ runId: 'run-2', target: 'vercel' }));

    const entries = await listDeploys();
    expect(entries.length).toBe(2);
    // Newest first (sorted by filename descending)
    expect(entries[0].runId).toBe('run-2');
    expect(entries[1].runId).toBe('run-1');
  });

  it('respects limit parameter', async () => {
    // Log 3 deploys with different runIds (same timestamp is fine — we just check count)
    await logDeploy(makeEntry({ runId: 'run-aaaa1111' }));
    await logDeploy(makeEntry({ runId: 'run-bbbb2222' }));
    await logDeploy(makeEntry({ runId: 'run-cccc3333' }));

    const entries = await listDeploys(2);
    expect(entries.length).toBe(2);
  });
});
