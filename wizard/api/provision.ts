/**
 * Provisioning API routes — SSE-streamed infrastructure provisioning.
 */

import type { IncomingMessage, ServerResponse } from 'node:http';
import { randomUUID } from 'node:crypto';
import { addRoute } from '../router.js';
import { getSessionPassword } from './credentials.js';
import { vaultGet, vaultKeys } from '../lib/vault.js';
import { parseJsonBody } from '../lib/body-parser.js';
import type { ProvisionContext, ProvisionEvent, Provisioner, CreatedResource } from '../lib/provisioners/types.js';
import { dockerProvisioner } from '../lib/provisioners/docker.js';
import { awsVpsProvisioner } from '../lib/provisioners/aws-vps.js';
import { vercelProvisioner } from '../lib/provisioners/vercel.js';
import { railwayProvisioner } from '../lib/provisioners/railway.js';
import { cloudflareProvisioner } from '../lib/provisioners/cloudflare.js';
import { staticS3Provisioner } from '../lib/provisioners/static-s3.js';
import {
  createManifest, updateManifestStatus, readManifest, deleteManifest,
  listIncompleteRuns, manifestToCreatedResources,
} from '../lib/provision-manifest.js';

function sendJson(res: ServerResponse, status: number, data: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(data));
}

const provisioners: Record<string, Provisioner> = {
  docker: dockerProvisioner,
  vps: awsVpsProvisioner,
  vercel: vercelProvisioner,
  railway: railwayProvisioner,
  cloudflare: cloudflareProvisioner,
  static: staticS3Provisioner,
};

/** Tracks resources per provisioning run by ID, keyed by runId. */
interface ProvisionRun {
  resources: CreatedResource[];
  credentials: Record<string, string>;
  target: string;
}
const provisionRuns = new Map<string, ProvisionRun>();

async function loadCredentials(password: string): Promise<Record<string, string>> {
  const keys = await vaultKeys(password);
  const creds: Record<string, string> = {};
  for (const key of keys) {
    const val = await vaultGet(password, key);
    if (val) creds[key] = val;
  }
  return creds;
}

// POST /api/provision/start — SSE stream provisioning events
addRoute('POST', '/api/provision/start', async (req: IncomingMessage, res: ServerResponse) => {
  const password = getSessionPassword();
  if (!password) {
    sendJson(res, 401, { error: 'Vault is locked.' });
    return;
  }

  const body = await parseJsonBody(req) as {
    projectDir?: string;
    projectName?: string;
    deployTarget?: string;
    framework?: string;
    database?: string;
    cache?: string;
  };

  if (!body.projectDir || !body.projectName || !body.deployTarget) {
    sendJson(res, 400, { error: 'projectDir, projectName, and deployTarget are required' });
    return;
  }

  const provisioner = provisioners[body.deployTarget];
  if (!provisioner) {
    sendJson(res, 400, { error: `Unknown deploy target: ${body.deployTarget}` });
    return;
  }

  const credentials = await loadCredentials(password);
  const runId = randomUUID();

  const ctx: ProvisionContext = {
    runId,
    projectDir: body.projectDir,
    projectName: body.projectName,
    deployTarget: body.deployTarget,
    framework: body.framework || 'express',
    database: body.database || 'none',
    cache: body.cache || 'none',
    credentials,
  };

  // Validate before starting SSE
  const errors = await provisioner.validate(ctx);
  if (errors.length > 0) {
    sendJson(res, 400, { error: errors.join('; ') });
    return;
  }

  // Start SSE stream
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
  });

  let clientDisconnected = false;

  function sseWrite(chunk: string): void {
    if (clientDisconnected || res.writableEnded) return;
    try { res.write(chunk); } catch { clientDisconnected = true; }
  }

  function sseEnd(): void {
    if (clientDisconnected || res.writableEnded) return;
    try { res.end(); } catch { /* already closed */ }
  }

  req.on('close', () => { clientDisconnected = true; });

  const emit = (event: ProvisionEvent): void => {
    sseWrite(`data: ${JSON.stringify(event)}\n\n`);
  };

  const region = credentials['aws-region'] || 'us-east-1';

  // Persist manifest to disk before starting (crash recovery)
  await createManifest(runId, body.deployTarget, region, body.projectName);

  try {
    const result = await provisioner.provision(ctx, emit);

    // Track for cleanup by run ID (in-memory for current session)
    if (result.resources.length > 0) {
      provisionRuns.set(runId, {
        resources: result.resources,
        credentials,
        target: body.deployTarget,
      });
    }

    // Update manifest on disk with final status
    await updateManifestStatus(runId, result.success ? 'complete' : 'failed');

    sseWrite(`data: ${JSON.stringify({ step: 'complete', status: result.success ? 'done' : 'error', message: result.success ? 'Provisioning complete' : result.error || 'Provisioning failed', result, runId })}\n\n`);
  } catch (err) {
    await updateManifestStatus(runId, 'failed');
    sseWrite(`data: ${JSON.stringify({ step: 'fatal', status: 'error', message: (err as Error).message })}\n\n`);
  }

  sseWrite('data: [DONE]\n\n');
  sseEnd();
});

// POST /api/provision/cleanup — clean up resources from a provisioning run
addRoute('POST', '/api/provision/cleanup', async (req: IncomingMessage, res: ServerResponse) => {
  const password = getSessionPassword();
  if (!password) {
    sendJson(res, 401, { error: 'Vault is locked.' });
    return;
  }

  const body = await parseJsonBody(req) as { runId?: string };

  // If no runId provided, clean up the most recent run
  let runId = body.runId;
  if (!runId) {
    const keys = [...provisionRuns.keys()];
    runId = keys[keys.length - 1];
  }

  if (!runId || !provisionRuns.has(runId)) {
    sendJson(res, 200, { cleaned: true, message: 'No resources to clean up' });
    return;
  }

  const run = provisionRuns.get(runId)!;
  const provisioner = provisioners[run.target];
  if (!provisioner) {
    sendJson(res, 400, { error: `Unknown target: ${run.target}` });
    return;
  }

  try {
    await provisioner.cleanup(run.resources, run.credentials);
    const count = run.resources.length;
    provisionRuns.delete(runId);
    // Mark manifest as cleaned and remove it
    await updateManifestStatus(runId, 'cleaned');
    await deleteManifest(runId);
    sendJson(res, 200, { cleaned: true, message: `Cleaned up ${count} resources` });
  } catch (err) {
    sendJson(res, 500, { error: `Cleanup failed: ${(err as Error).message}` });
  }
});

// GET /api/provision/incomplete — check for orphaned runs from crashes
addRoute('GET', '/api/provision/incomplete', async (_req: IncomingMessage, res: ServerResponse) => {
  const incomplete = await listIncompleteRuns();
  sendJson(res, 200, {
    runs: incomplete.map((m) => ({
      runId: m.runId,
      startedAt: m.startedAt,
      target: m.target,
      projectName: m.projectName,
      resourceCount: m.resources.filter((r) => r.status === 'created').length,
      resources: m.resources.filter((r) => r.status === 'created').map((r) => `${r.type}: ${r.id}`),
    })),
  });
});
