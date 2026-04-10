/**
 * Provision manifest tests — CRUD, path validation, resource tracking.
 * Tier 2: Mocked filesystem operations.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('node:fs', () => ({
  existsSync: vi.fn(() => false),
}));
vi.mock('node:fs/promises', () => ({
  readFile: vi.fn(() => Promise.reject(new Error('ENOENT'))),
  readdir: vi.fn(() => Promise.resolve([])),
  unlink: vi.fn(() => Promise.resolve()),
  mkdir: vi.fn(() => Promise.resolve()),
  open: vi.fn(() => Promise.resolve({
    writeFile: vi.fn(() => Promise.resolve()),
    sync: vi.fn(() => Promise.resolve()),
    close: vi.fn(() => Promise.resolve()),
  })),
  rename: vi.fn(() => Promise.resolve()),
}));

import {
  createManifest,
  readManifest,
  updateManifestStatus,
  recordResourcePending,
  recordResourceCreated,
  recordResourceCleaned,
  deleteManifest,
  listIncompleteRuns,
  manifestToCreatedResources,
} from '../lib/provision-manifest.js';
import type { ProvisionManifest } from '../lib/provision-manifest.js';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('createManifest', () => {
  it('creates a manifest with correct initial state', async () => {
    const runId = '12345678-1234-1234-1234-123456789012';
    const manifest = await createManifest(runId, 'vps', 'us-east-1', 'my-project');
    expect(manifest.runId).toBe(runId);
    expect(manifest.target).toBe('vps');
    expect(manifest.region).toBe('us-east-1');
    expect(manifest.projectName).toBe('my-project');
    expect(manifest.status).toBe('in-progress');
    expect(manifest.resources).toHaveLength(0);
  });

  it('rejects invalid runId (path traversal protection)', async () => {
    await expect(createManifest('../../../etc/passwd', 'vps', 'us-east-1', 'evil'))
      .rejects.toThrow('Invalid runId format');
  });

  it('rejects non-UUID runId', async () => {
    await expect(createManifest('not-a-uuid', 'vps', 'us-east-1', 'test'))
      .rejects.toThrow('Invalid runId format');
  });
});

describe('readManifest', () => {
  it('returns null when manifest does not exist', async () => {
    const result = await readManifest('12345678-1234-1234-1234-123456789012');
    expect(result).toBeNull();
  });
});

describe('listIncompleteRuns', () => {
  it('returns empty array when no runs directory exists', async () => {
    const result = await listIncompleteRuns();
    expect(result).toEqual([]);
  });
});

describe('manifestToCreatedResources', () => {
  it('filters to only created resources', () => {
    const manifest: ProvisionManifest = {
      runId: '12345678-1234-1234-1234-123456789012',
      startedAt: new Date().toISOString(),
      target: 'vps',
      region: 'us-east-1',
      projectName: 'test',
      status: 'in-progress',
      resources: [
        { type: 'ec2', id: 'i-123', region: 'us-east-1', status: 'created' },
        { type: 'sg', id: 'sg-456', region: 'us-east-1', status: 'pending' },
        { type: 'eip', id: 'eipalloc-789', region: 'us-east-1', status: 'cleaned' },
      ],
    };
    const result = manifestToCreatedResources(manifest);
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe('ec2');
    expect(result[0].id).toBe('i-123');
  });

  it('returns empty array when no created resources', () => {
    const manifest: ProvisionManifest = {
      runId: '12345678-1234-1234-1234-123456789012',
      startedAt: new Date().toISOString(),
      target: 'docker',
      region: 'us-east-1',
      projectName: 'test',
      status: 'in-progress',
      resources: [
        { type: 'sg', id: 'sg-1', region: 'us-east-1', status: 'pending' },
      ],
    };
    const result = manifestToCreatedResources(manifest);
    expect(result).toHaveLength(0);
  });
});
