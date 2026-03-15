/**
 * Provisioning API routes — SSE-streamed infrastructure provisioning.
 */

import type { IncomingMessage, ServerResponse } from 'node:http';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
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
import { provisionDns, cleanupDnsRecords } from '../lib/dns/cloudflare-dns.js';
import { registerDomain } from '../lib/dns/cloudflare-registrar.js';
import { prepareGithub } from '../lib/github.js';
import { sshDeploy } from '../lib/ssh-deploy.js';
import { s3Deploy } from '../lib/s3-deploy.js';

/** Deploy targets that benefit from GitHub repo linking (ADR-015). */
const GITHUB_LINKED_TARGETS = ['vercel', 'cloudflare', 'railway'];
/** Deploy targets where GitHub push is optional (deploy via SSH/SDK instead). */
const GITHUB_OPTIONAL_TARGETS = ['vps', 'static'];

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

/** Concurrency lock — only one provisioning run at a time (F-02). */
let activeProvisionRun: string | null = null;

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

  if (activeProvisionRun) {
    sendJson(res, 429, { error: 'A provisioning run is already in progress. Wait for it to complete.' });
    return;
  }

  const body = await parseJsonBody(req) as {
    projectDir?: string;
    projectName?: string;
    deployTarget?: string;
    framework?: string;
    database?: string;
    cache?: string;
    instanceType?: string;
    hostname?: string;
    registerDomain?: boolean;
  };

  // Domain format validation (Fix 4: server-side validation)
  if (body.hostname && !/^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$/i.test(body.hostname)) {
    sendJson(res, 400, { error: 'Invalid hostname format' });
    return;
  }

  if (!body.projectDir || !body.projectName || !body.deployTarget) {
    sendJson(res, 400, { error: 'projectDir, projectName, and deployTarget are required' });
    return;
  }

  // Validate projectDir (Kenobi: prevent directory traversal / file exfiltration)
  if (!body.projectDir.startsWith('/') || body.projectDir.includes('..')) {
    sendJson(res, 400, { error: 'projectDir must be an absolute path with no ".." segments' });
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
    instanceType: body.instanceType || 't3.micro',
    hostname: body.hostname || '',
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

  const abortController = new AbortController();
  ctx.abortSignal = abortController.signal;

  req.on('close', () => {
    clientDisconnected = true;
    abortController.abort();
    clearInterval(keepaliveTimer);
  });

  // SSE keepalive — prevents proxy/VPN/browser timeout on idle connections
  const keepaliveTimer = setInterval(() => {
    sseWrite(': keepalive\n\n');
  }, 15000);

  let eventId = 0;
  const emit = (event: ProvisionEvent): void => {
    eventId++;
    sseWrite(`id: ${eventId}\ndata: ${JSON.stringify(event)}\n\n`);
  };

  const region = credentials['aws-region'] || 'us-east-1';

  // Persist manifest to disk before starting (crash recovery)
  await createManifest(runId, body.deployTarget, region, body.projectName);

  activeProvisionRun = runId;
  /** Shared outputs that pre-steps inject and provisioners consume. */
  const sharedOutputs: Record<string, string> = {};

  try {
    // ── GitHub pre-step (ADR-011) ──────────────────────────────────
    // Runs before the provisioner so platforms can link to the repo.
    const hasGithub = credentials['github-token'];
    const needsGithub = GITHUB_LINKED_TARGETS.includes(body.deployTarget);
    const wantsGithub = GITHUB_OPTIONAL_TARGETS.includes(body.deployTarget);

    if (hasGithub && (needsGithub || wantsGithub)) {
      const ghResult = await prepareGithub(
        runId,
        credentials['github-token'],
        credentials['github-owner'] || null,
        body.projectName,
        body.projectDir,
        emit,
        abortController.signal,
      );
      if (ghResult.success) {
        sharedOutputs['GITHUB_REPO_URL'] = ghResult.repoUrl!;
        sharedOutputs['GITHUB_OWNER'] = ghResult.owner!;
        sharedOutputs['GITHUB_REPO_NAME'] = ghResult.repoName!;
      } else if (needsGithub) {
        // For platforms that require GitHub, warn but continue (graceful degradation)
        emit({ step: 'github-warning', status: 'error', message: `GitHub setup failed — ${body.deployTarget} project will be created without auto-deploy. Push manually later.`, detail: ghResult.error });
      }
    } else if (!hasGithub && needsGithub) {
      emit({ step: 'github-skip', status: 'skipped', message: `No GitHub token in vault. ${body.deployTarget} project will be created without auto-deploy. Add GitHub credentials for CI/CD.` });
    }

    // Pass GitHub outputs to provisioner via credentials (provisioners read from credentials map)
    if (sharedOutputs['GITHUB_OWNER']) {
      ctx.credentials['_github-owner'] = sharedOutputs['GITHUB_OWNER'];
      ctx.credentials['_github-repo-name'] = sharedOutputs['GITHUB_REPO_NAME'];
    }

    // ── Provisioner ──────────────────────────────────────────────
    const result = await provisioner.provision(ctx, emit);

    // Merge shared outputs into result
    for (const [k, v] of Object.entries(sharedOutputs)) {
      result.outputs[k] = v;
    }

    // ── Deploy post-step (v3.8.0 Last Mile) ──────────────────────
    if (result.success && body.deployTarget === 'vps') {
      // AWS VPS: SSH in and execute deploy scripts
      const sshHost = result.outputs['SSH_HOST'];
      const sshUser = result.outputs['SSH_USER'] || 'ec2-user';
      const sshKey = result.outputs['SSH_KEY_PATH'] || '.ssh/deploy-key.pem';
      if (sshHost) {
        const deployResult = await sshDeploy(
          body.projectDir,
          sshHost,
          sshUser,
          sshKey,
          ctx.hostname || undefined,
          ctx.framework,
          emit,
          abortController.signal,
        );
        if (deployResult.deployUrl) {
          result.outputs['DEPLOY_URL'] = deployResult.deployUrl;
        }
      } else {
        emit({ step: 'deploy-skip', status: 'skipped', message: 'No SSH host available — SSH deploy skipped' });
      }
    } else if (result.success && body.deployTarget === 'static') {
      // S3 Static: Upload build directory
      const bucket = result.outputs['S3_BUCKET'];
      const websiteUrl = result.outputs['S3_WEBSITE_URL'];
      const awsKeyId = credentials['aws-access-key-id'];
      const awsSecret = credentials['aws-secret-access-key'];
      if (bucket && websiteUrl && awsKeyId && awsSecret) {
        const s3Result = await s3Deploy(
          bucket,
          join(body.projectDir, 'dist'),
          credentials['aws-region'] || 'us-east-1',
          {
            accessKeyId: awsKeyId,
            secretAccessKey: awsSecret,
          },
          websiteUrl,
          emit,
        );
        if (s3Result.deployUrl) {
          result.outputs['DEPLOY_URL'] = s3Result.deployUrl;
        }
      } else {
        emit({ step: 'deploy-skip', status: 'skipped', message: 'No S3 bucket available — upload skipped' });
      }
    } else if (result.success && (body.deployTarget === 'vercel' || body.deployTarget === 'cloudflare' || body.deployTarget === 'railway')) {
      // Platform deploys are triggered by the git push — provisioner handles polling
      const deployUrl = result.outputs['DEPLOY_URL'] || result.outputs['VERCEL_DOMAIN'] || result.outputs['CF_PROJECT_URL'] || result.outputs['RAILWAY_DOMAIN'];
      if (deployUrl && !result.outputs['DEPLOY_URL']) {
        result.outputs['DEPLOY_URL'] = deployUrl.startsWith('http') ? deployUrl : `https://${deployUrl}`;
      }
    }

    // Domain registration — pre-DNS step (non-fatal, irreversible)
    // Registration creates the Cloudflare zone, which DNS needs to exist (ADR-010)
    if (result.success && body.registerDomain && ctx.hostname && credentials['cloudflare-api-token'] && credentials['cloudflare-account-id']) {
      const regResult = await registerDomain(
        credentials['cloudflare-api-token'],
        credentials['cloudflare-account-id'],
        ctx.hostname,
        emit,
      );

      if (regResult.success) {
        result.outputs['REGISTRAR_DOMAIN'] = regResult.domain || ctx.hostname;
        if (regResult.expiresAt) result.outputs['REGISTRAR_EXPIRY'] = regResult.expiresAt;
        // Note: domain registration is NOT tracked for cleanup — it's irreversible
      }
      // Registration failure is non-fatal — DNS may still work if zone already exists
    } else if (result.success && body.registerDomain && ctx.hostname && !credentials['cloudflare-account-id']) {
      emit({ step: 'registrar-skip', status: 'skipped', message: 'Domain registration requested but no Cloudflare Account ID in vault. Add it in Cloud Providers.' });
    } else if (result.success && body.registerDomain && ctx.hostname && !credentials['cloudflare-api-token']) {
      emit({ step: 'registrar-skip', status: 'skipped', message: 'Domain registration requested but no Cloudflare API token in vault. Add Cloudflare credentials to enable registration.' });
    }

    // DNS post-provision step (non-fatal)
    if (result.success && ctx.hostname && credentials['cloudflare-api-token']) {
      const dnsResult = await provisionDns(
        runId,
        credentials['cloudflare-api-token'],
        ctx.hostname,
        body.deployTarget,
        result.outputs,
        emit,
      );

      // Add DNS records to resource list for cleanup tracking
      if (dnsResult.records.length > 0) {
        for (const record of dnsResult.records) {
          result.resources.push({
            type: 'dns-record',
            id: `${dnsResult.zoneId}:${record.id}`,
            region: 'global',
          });
        }
        result.outputs['DNS_HOSTNAME'] = ctx.hostname;
        result.outputs['DNS_ZONE_ID'] = dnsResult.zoneId;
      }
    } else if (result.success && ctx.hostname && !credentials['cloudflare-api-token']) {
      emit({ step: 'dns-skip', status: 'skipped', message: `Hostname "${ctx.hostname}" set but no Cloudflare token in vault. Add Cloudflare credentials to enable DNS wiring.` });
    }

    // Track for cleanup by run ID (in-memory for current session)
    if (result.resources.length > 0) {
      // Store only cleanup-relevant credentials, not the full vault (Kenobi: minimize credential exposure)
      const cleanupCreds: Record<string, string> = {};
      const cleanupKeys: Record<string, string[]> = {
        vps: ['aws-access-key-id', 'aws-secret-access-key', 'aws-region'],
        static: ['aws-access-key-id', 'aws-secret-access-key', 'aws-region'],
        vercel: ['vercel-token'],
        railway: ['railway-token'],
        cloudflare: ['cloudflare-api-token'],
        docker: [],
      };
      for (const key of (cleanupKeys[body.deployTarget] || [])) {
        if (credentials[key]) cleanupCreds[key] = credentials[key];
      }
      // Always include Cloudflare token if DNS records were created
      if (result.resources.some(r => r.type === 'dns-record') && credentials['cloudflare-api-token']) {
        cleanupCreds['cloudflare-api-token'] = credentials['cloudflare-api-token'];
      }
      provisionRuns.set(runId, {
        resources: result.resources,
        credentials: cleanupCreds,
        target: body.deployTarget,
      });
    }

    // Update manifest on disk with final status
    await updateManifestStatus(runId, result.success ? 'complete' : 'failed');

    // Strip DB_PASSWORD from SSE payload — secret must not leak to the client (Kenobi F-03)
    const safeOutputs = { ...result.outputs };
    delete safeOutputs['DB_PASSWORD'];
    delete safeOutputs['GITHUB_TOKEN'];
    // Ensure no credential keys leaked into outputs
    for (const key of Object.keys(safeOutputs)) {
      if (key.toLowerCase().includes('password') || key.toLowerCase().includes('secret') || key.toLowerCase().includes('token')) {
        delete safeOutputs[key];
      }
    }
    const safeResult = { ...result, outputs: safeOutputs };

    sseWrite(`data: ${JSON.stringify({ step: 'complete', status: result.success ? 'done' : 'error', message: result.success ? 'Provisioning complete' : result.error || 'Provisioning failed', result: safeResult, runId })}\n\n`);
  } catch (err) {
    const errMsg = (err as Error).message;
    console.error('Provisioning fatal error:', errMsg);
    await updateManifestStatus(runId, 'failed');
    sseWrite(`data: ${JSON.stringify({ step: 'fatal', status: 'error', message: 'Provisioning failed unexpectedly' })}\n\n`);
  } finally {
    activeProvisionRun = null;
  }

  clearInterval(keepaliveTimer);
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

  // Try in-memory runs first, then fall back to disk manifests (crash recovery)
  let target: string;
  let resources: CreatedResource[];
  let credentials: Record<string, string>;

  if (runId && provisionRuns.has(runId)) {
    const run = provisionRuns.get(runId)!;
    target = run.target;
    resources = run.resources;
    credentials = run.credentials;
  } else if (runId) {
    // Crash recovery: load from disk manifest + vault credentials
    const manifest = await readManifest(runId);
    if (!manifest || manifest.status === 'cleaned') {
      sendJson(res, 200, { cleaned: true, message: 'No resources to clean up' });
      return;
    }
    target = manifest.target;
    resources = manifestToCreatedResources(manifest);
    credentials = await loadCredentials(password);
  } else {
    sendJson(res, 200, { cleaned: true, message: 'No resources to clean up' });
    return;
  }

  if (resources.length === 0) {
    await deleteManifest(runId);
    sendJson(res, 200, { cleaned: true, message: 'No resources to clean up' });
    return;
  }

  const provisioner = provisioners[target];
  if (!provisioner) {
    sendJson(res, 400, { error: `Unknown target: ${target}` });
    return;
  }

  try {
    // Clean up DNS records separately (they're not managed by the provisioner)
    // Skip github-repo — repos are tracked for idempotency, not cleanup (ADR-012)
    const dnsResources = resources.filter((r) => r.type === 'dns-record');
    const infraResources = resources.filter((r) => r.type !== 'dns-record' && r.type !== 'github-repo');

    if (dnsResources.length > 0 && credentials['cloudflare-api-token']) {
      await cleanupDnsRecords(
        credentials['cloudflare-api-token'],
        dnsResources.map((r) => r.id),
      );
    }

    // Clean up infrastructure resources via the provisioner
    if (infraResources.length > 0) {
      await provisioner.cleanup(infraResources, credentials);
    }

    const count = resources.length;
    provisionRuns.delete(runId);
    await updateManifestStatus(runId, 'cleaned');
    await deleteManifest(runId);
    const notes: string[] = [];
    // Domain registration and GitHub repos are irreversible — always warn
    notes.push('Note: If a domain was registered during this run, that purchase cannot be reversed. Manage it at dash.cloudflare.com.');
    if (resources.some((r) => r.type === 'github-repo')) {
      notes.push('Note: GitHub repository was not deleted (repos are preserved). Delete manually at github.com if needed.');
    }
    sendJson(res, 200, { cleaned: true, message: `Cleaned up ${count} resources`, notes });
  } catch (err) {
    sendJson(res, 500, { error: `Cleanup failed: ${(err as Error).message}` });
  }
});

// GET /api/provision/incomplete — check for orphaned runs from crashes
addRoute('GET', '/api/provision/incomplete', async (_req: IncomingMessage, res: ServerResponse) => {
  const password = getSessionPassword();
  if (!password) {
    sendJson(res, 401, { error: 'Vault is locked.' });
    return;
  }

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
