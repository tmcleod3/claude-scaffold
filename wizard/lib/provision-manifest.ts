/**
 * Provision manifest — persists resource state to disk for crash recovery.
 *
 * Before each AWS resource creation, the intended action is recorded.
 * After creation, the resource ID is written. On cleanup, the manifest
 * is read and resources deleted in reverse. On wizard startup, incomplete
 * manifests can be detected and cleaned up.
 *
 * Stored at ~/.voidforge/runs/<runId>.json
 */

import { readFile, writeFile, readdir, unlink, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import type { CreatedResource } from './provisioners/types.js';

const RUNS_DIR = join(homedir(), '.voidforge', 'runs');

/** QA-R2-004: Write queue to serialize manifest mutations and prevent race conditions */
let writeQueue: Promise<void> = Promise.resolve();

function serialized<T>(fn: () => Promise<T>): Promise<T> {
  const result = writeQueue.then(fn, () => fn());
  writeQueue = result.then(() => {}, () => {});
  return result;
}

export interface ManifestResource {
  type: string;
  id: string;
  region: string;
  status: 'pending' | 'created' | 'cleaned' | 'failed';
}

export interface ProvisionManifest {
  runId: string;
  startedAt: string;
  target: string;
  region: string;
  projectName: string;
  status: 'in-progress' | 'complete' | 'failed' | 'cleaned';
  resources: ManifestResource[];
}

async function ensureDir(): Promise<void> {
  await mkdir(RUNS_DIR, { recursive: true });
}

// SEC-R3-013: Validate runId is a UUID to prevent path traversal
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

function manifestPath(runId: string): string {
  if (!UUID_RE.test(runId)) throw new Error('Invalid runId format');
  return join(RUNS_DIR, `${runId}.json`);
}

/** Create a new manifest for a provisioning run. */
export function createManifest(runId: string, target: string, region: string, projectName: string): Promise<ProvisionManifest> {
  // QA-R3-004: Wrap in serialized() for consistency with other mutation functions
  return serialized(async () => {
    await ensureDir();
    const manifest: ProvisionManifest = {
      runId,
      startedAt: new Date().toISOString(),
      target,
      region,
      projectName,
      status: 'in-progress',
      resources: [],
    };
    await writeFile(manifestPath(runId), JSON.stringify(manifest, null, 2), 'utf-8');
    return manifest;
  });
}

/** Record that a resource is about to be created (write-ahead). */
export function recordResourcePending(runId: string, type: string, id: string, region: string): Promise<void> {
  return serialized(async () => {
    const manifest = await readManifest(runId);
    if (!manifest) return;
    manifest.resources.push({ type, id, region, status: 'pending' });
    await writeFile(manifestPath(runId), JSON.stringify(manifest, null, 2), 'utf-8');
  });
}

/** Record that a resource was successfully created. */
export function recordResourceCreated(runId: string, type: string, id: string, region: string): Promise<void> {
  return serialized(async () => {
    const manifest = await readManifest(runId);
    if (!manifest) return;

    const existing = manifest.resources.find((r) => r.type === type && r.id === id);
    if (existing) {
      existing.status = 'created';
    } else {
      manifest.resources.push({ type, id, region, status: 'created' });
    }
    await writeFile(manifestPath(runId), JSON.stringify(manifest, null, 2), 'utf-8');
  });
}

/** Mark the overall run status. */
export function updateManifestStatus(runId: string, status: ProvisionManifest['status']): Promise<void> {
  return serialized(async () => {
    const manifest = await readManifest(runId);
    if (!manifest) return;
    manifest.status = status;
    await writeFile(manifestPath(runId), JSON.stringify(manifest, null, 2), 'utf-8');
  });
}

/** Mark a resource as cleaned up. */
export function recordResourceCleaned(runId: string, type: string, id: string): Promise<void> {
  return serialized(async () => {
    const manifest = await readManifest(runId);
    if (!manifest) return;
    const resource = manifest.resources.find((r) => r.type === type && r.id === id);
    if (resource) resource.status = 'cleaned';
    await writeFile(manifestPath(runId), JSON.stringify(manifest, null, 2), 'utf-8');
  });
}

/** Read a manifest by run ID. Returns null if not found. */
export async function readManifest(runId: string): Promise<ProvisionManifest | null> {
  const path = manifestPath(runId);
  if (!existsSync(path)) return null;
  try {
    const raw = await readFile(path, 'utf-8');
    return JSON.parse(raw) as ProvisionManifest;
  } catch {
    return null;
  }
}

/** Delete a manifest file (after successful cleanup). */
export async function deleteManifest(runId: string): Promise<void> {
  const path = manifestPath(runId);
  try { await unlink(path); } catch { /* already gone */ }
}

/** List all incomplete manifests (for recovery on startup). */
export async function listIncompleteRuns(): Promise<ProvisionManifest[]> {
  await ensureDir();
  const incomplete: ProvisionManifest[] = [];
  try {
    const files = await readdir(RUNS_DIR);
    for (const file of files) {
      if (!file.endsWith('.json')) continue;
      try {
        const raw = await readFile(join(RUNS_DIR, file), 'utf-8');
        const manifest = JSON.parse(raw) as ProvisionManifest;
        if (manifest.status === 'in-progress' || manifest.status === 'failed') {
          const hasCreatedResources = manifest.resources.some((r) => r.status === 'created');
          if (hasCreatedResources) {
            incomplete.push(manifest);
          }
        }
      } catch { /* skip corrupt files */ }
    }
  } catch { /* directory might not exist */ }
  return incomplete;
}

/** Convert manifest resources to the CreatedResource[] format used by provisioners. */
export function manifestToCreatedResources(manifest: ProvisionManifest): CreatedResource[] {
  return manifest.resources
    .filter((r) => r.status === 'created')
    .map((r) => ({ type: r.type, id: r.id, region: r.region }));
}
