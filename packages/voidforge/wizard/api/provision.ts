/**
 * Provisioning API routes — SSE-streamed infrastructure provisioning.
 */

import type { IncomingMessage, ServerResponse } from 'node:http';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { realpath } from 'node:fs/promises';
import { addRoute } from '../router.js';
import { getSessionPassword } from './credentials.js';
import { vaultGet, vaultKeys } from '../lib/vault.js';
import { parseJsonBody } from '../lib/body-parser.js';
import type { ProvisionContext, ProvisionEvent, CreatedResource } from '../lib/provisioners/types.js';
import { provisioners, provisionKeys, GITHUB_LINKED_TARGETS, GITHUB_OPTIONAL_TARGETS } from '../lib/provisioner-registry.js';
import {
  createManifest, updateManifestStatus, readManifest, deleteManifest,
  listIncompleteRuns, manifestToCreatedResources,
} from '../lib/provision-manifest.js';
import { provisionDns, cleanupDnsRecords } from '../lib/dns/cloudflare-dns.js';
import { registerDomain } from '../lib/dns/cloudflare-registrar.js';
import { prepareGithub } from '../lib/github.js';
import { sshDeploy } from '../lib/ssh-deploy.js';
import { s3Deploy } from '../lib/s3-deploy.js';
import { runBuildStep, getBuildOutputDir } from '../lib/build-step.js';
import { generateEnvValidator } from '../lib/env-validator.js';
import { emitCostEstimate } from '../lib/cost-estimator.js';
import { logDeploy, listDeploys } from '../lib/deploy-log.js';
import { setupHealthMonitoring } from '../lib/health-monitor.js';
import { generateSentryInit } from '../lib/sentry-generator.js';
import { sendJson } from '../lib/http-helpers.js';

/** Tracks resources per provisioning run by ID, keyed by runId. */
interface ProvisionRun {
  resources: CreatedResource[];
  credentials: Record<string, string>;
  target: string;
}
const provisionRuns = new Map<string, ProvisionRun>();

/** Concurrency lock — only one provisioning run at a time (F-02). */
let activeProvisionRun: string | null = null;

/** Scope credentials to only the keys a provisioner needs. Internal _-prefixed keys pass through. */
function scopeCredentials(allCreds: Record<string, string>, target: string): Record<string, string> {
  const allowed = provisionKeys[target] || [];
  const scoped: Record<string, string> = {};
  for (const key of allowed) {
    if (allCreds[key]) scoped[key] = allCreds[key];
  }
  // Internal keys (injected by pre-steps) always pass through
  for (const [key, val] of Object.entries(allCreds)) {
    if (key.startsWith('_')) scoped[key] = val;
  }
  return scoped;
}

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

  // Parse and validate BEFORE acquiring the lock (IG-R2: prevent lock deadlock on validation failure)
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
    sendJson(res, 400, { error: 'Invalid hostname format. Expected something like: myapp.example.com' });
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

  // IG-R4: Resolve symlinks and use real path for all operations
  try {
    body.projectDir = await realpath(body.projectDir);
  } catch {
    sendJson(res, 400, { error: 'Could not resolve project directory path' });
    return;
  }

  const provisioner = provisioners[body.deployTarget];
  if (!provisioner) {
    sendJson(res, 400, { error: `Unknown deploy target: ${body.deployTarget}` });
    return;
  }

  // Load and validate credentials BEFORE acquiring lock (IG-R3: all failable steps before lock)
  let allCredentials: Record<string, string>;
  try {
    allCredentials = await loadCredentials(password);
  } catch {
    sendJson(res, 500, { error: 'Failed to load credentials from vault' });
    return;
  }

  // Scope credentials to only what this provisioner needs (ADR-020)
  const scopedCreds = scopeCredentials(allCredentials, body.deployTarget);
  const runId = randomUUID();

  const ctx: ProvisionContext = {
    runId,
    projectDir: body.projectDir,
    projectName: body.projectName,
    deployTarget: body.deployTarget,
    framework: (body.framework || 'express').toLowerCase(),
    database: body.database || 'none',
    cache: body.cache || 'none',
    instanceType: body.instanceType || 't3.micro',
    hostname: body.hostname || '',
    credentials: scopedCreds,
  };

  // Validate provisioner context BEFORE acquiring lock (IG-R3: prevents lock leak)
  const errors = await provisioner.validate(ctx);
  if (errors.length > 0) {
    sendJson(res, 400, { error: errors.join('; ') });
    return;
  }

  // CROSS-R4-011: Lock acquired AFTER all validation passes — only SSE streaming can fail from here
  if (activeProvisionRun) {
    sendJson(res, 429, { error: 'A provisioning run is already in progress. Wait for it to complete.' });
    return;
  }
  activeProvisionRun = runId;

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

  const region = allCredentials['aws-region'] || 'us-east-1';

  // Persist manifest to disk before starting (crash recovery)
  await createManifest(runId, body.deployTarget, region, body.projectName);

  /** Shared outputs that pre-steps inject and provisioners consume. */
  const sharedOutputs: Record<string, string> = {};

  try {
    // ── GitHub pre-step (ADR-011) ──────────────────────────────────
    // Runs before the provisioner so platforms can link to the repo.
    // Uses allCredentials — GitHub token is not in provisioner-scoped creds (ADR-020).
    const hasGithub = allCredentials['github-token'];
    const needsGithub = GITHUB_LINKED_TARGETS.includes(body.deployTarget);
    const wantsGithub = GITHUB_OPTIONAL_TARGETS.includes(body.deployTarget);

    if (hasGithub && (needsGithub || wantsGithub)) {
      const ghResult = await prepareGithub(
        runId,
        allCredentials['github-token'],
        allCredentials['github-owner'] || null,
        body.projectName,
        body.projectDir,
        emit,
        abortController.signal,
        ctx.framework,
        body.deployTarget,
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

    // ── Cost estimation (ADR-022) ──────────────────────────────────
    emitCostEstimate(body.deployTarget, ctx.instanceType, ctx.database, ctx.cache, emit);

    // ── Provisioner ──────────────────────────────────────────────
    const result = await provisioner.provision(ctx, emit);

    // Merge shared outputs into result
    for (const [k, v] of Object.entries(sharedOutputs)) {
      result.outputs[k] = v;
    }

    // ── Pre-deploy build step (ADR-016) ────────────────────────────
    // Runs AFTER provisioner but BEFORE deploy actions.
    if (result.success && body.deployTarget !== 'docker') {
      const buildResult = await runBuildStep(
        body.projectDir,
        ctx.framework,
        emit,
        abortController.signal,
      );
      if (!buildResult.success) {
        emit({ step: 'build-fatal', status: 'error', message: 'Build failed — infrastructure was created, but code deploy will be skipped. Fix the build locally and deploy manually.', detail: buildResult.error });
      }
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
      const awsKeyId = allCredentials['aws-access-key-id'];
      const awsSecret = allCredentials['aws-secret-access-key'];
      if (bucket && websiteUrl && awsKeyId && awsSecret) {
        const s3Result = await s3Deploy(
          bucket,
          join(body.projectDir, getBuildOutputDir(ctx.framework)),
          allCredentials['aws-region'] || 'us-east-1',
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
    if (result.success && body.registerDomain && ctx.hostname && allCredentials['cloudflare-api-token'] && allCredentials['cloudflare-account-id']) {
      const regResult = await registerDomain(
        allCredentials['cloudflare-api-token'],
        allCredentials['cloudflare-account-id'],
        ctx.hostname,
        emit,
      );

      if (regResult.success) {
        result.outputs['REGISTRAR_DOMAIN'] = regResult.domain || ctx.hostname;
        if (regResult.expiresAt) result.outputs['REGISTRAR_EXPIRY'] = regResult.expiresAt;
        // Note: domain registration is NOT tracked for cleanup — it's irreversible
      }
      // Registration failure is non-fatal — DNS may still work if zone already exists
    } else if (result.success && body.registerDomain && ctx.hostname && !allCredentials['cloudflare-account-id']) {
      emit({ step: 'registrar-skip', status: 'skipped', message: 'Domain registration requested but no Cloudflare Account ID in vault. Add it in Cloud Providers.' });
    } else if (result.success && body.registerDomain && ctx.hostname && !allCredentials['cloudflare-api-token']) {
      emit({ step: 'registrar-skip', status: 'skipped', message: 'Domain registration requested but no Cloudflare API token in vault. Add Cloudflare credentials to enable registration.' });
    }

    // DNS post-provision step (non-fatal)
    if (result.success && ctx.hostname && allCredentials['cloudflare-api-token']) {
      const dnsResult = await provisionDns(
        runId,
        allCredentials['cloudflare-api-token'],
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
    } else if (result.success && ctx.hostname && !allCredentials['cloudflare-api-token']) {
      emit({ step: 'dns-skip', status: 'skipped', message: `Hostname "${ctx.hostname}" set but no Cloudflare token in vault. Add Cloudflare credentials to enable DNS wiring.` });
    }

    // ── Sentry integration (ADR-024) — before env-validator so DSN is in .env ──
    if (result.success) {
      await generateSentryInit(
        body.projectDir,
        ctx.framework,
        allCredentials['sentry-dsn'],
        emit,
      );
    }

    // ── Environment validation script (ADR-018) ──────────────────
    if (result.success) {
      const envResult = await generateEnvValidator(body.projectDir, ctx.framework);
      if (envResult.file) {
        const hint = envResult.file.endsWith('.py')
          ? 'Add "python validate_env.py &&" before your start command'
          : 'Add "node validate-env.js &&" before your start command in package.json';
        emit({ step: 'env-validator', status: 'done', message: `Generated ${envResult.file} — ${hint}` });
      } else {
        emit({ step: 'env-validator', status: 'skipped', message: 'No .env file found — env validation script skipped' });
      }
    }

    // ── Health monitoring (ADR-023) ──────────────────────────────
    if (result.success) {
      const deployUrl = result.outputs['DEPLOY_URL'] || '';
      await setupHealthMonitoring(
        body.deployTarget,
        body.projectDir,
        body.projectName,
        deployUrl,
        result.outputs,
        emit,
      );
    }

    // ── Deploy logging (ADR-021) ─────────────────────────────────
    if (result.success) {
      try {
        // Sanitize outputs before persisting — strip secrets (same keywords as SSE sanitizer)
        const logOutputs = { ...result.outputs };
        delete logOutputs['DB_PASSWORD'];
        delete logOutputs['GITHUB_TOKEN'];
        const SAFE_LOG_KEYS = new Set(['DEPLOY_URL', 'S3_WEBSITE_URL', 'CF_PROJECT_URL', 'GITHUB_REPO_URL', 'SSH_KEY_PATH']);
        for (const key of Object.keys(logOutputs)) {
          if (SAFE_LOG_KEYS.has(key)) continue;
          const lk = key.toLowerCase();
          if (lk.includes('password') || lk.includes('secret') || lk.includes('token')
              || lk.includes('credential') || lk.includes('_key') || lk.includes('_pass')
              || lk.includes('_pwd') || lk.includes('passphrase') || lk.includes('bearer')
              || lk.includes('oauth') || lk.includes('jwt') || lk.includes('signing')
              || lk.includes('private') || lk.includes('connection_uri') || lk.includes('database_url')
              || lk.includes('redis_url') || lk.includes('mongo_uri')
              || lk.includes('cert') || lk.includes('hmac') || lk.includes('auth_code')) {
            delete logOutputs[key];
          }
        }
        const logPath = await logDeploy({
          runId,
          timestamp: new Date().toISOString(),
          target: body.deployTarget,
          projectName: body.projectName,
          framework: ctx.framework,
          deployUrl: result.outputs['DEPLOY_URL'] || '',
          hostname: ctx.hostname,
          region,
          resources: result.resources.map(r => ({ type: r.type, id: r.id })),
          outputs: logOutputs,
        });
        emit({ step: 'deploy-log', status: 'done', message: `Deploy logged to ${logPath}` });
      } catch {
        // Non-fatal — deploy succeeded even if logging fails
      }
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
        if (allCredentials[key]) cleanupCreds[key] = allCredentials[key];
      }
      // Always include Cloudflare token if DNS records were created
      if (result.resources.some(r => r.type === 'dns-record') && allCredentials['cloudflare-api-token']) {
        cleanupCreds['cloudflare-api-token'] = allCredentials['cloudflare-api-token'];
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
    // IG-R4/R5: Secret stripping — broad keywords + allowlist for safe output keys
    const SAFE_OUTPUT_KEYS = new Set(['DEPLOY_URL', 'S3_WEBSITE_URL', 'CF_PROJECT_URL', 'GITHUB_REPO_URL', 'SSH_KEY_PATH']);
    for (const key of Object.keys(safeOutputs)) {
      if (SAFE_OUTPUT_KEYS.has(key)) continue;
      const lk = key.toLowerCase();
      if (lk.includes('password') || lk.includes('secret') || lk.includes('token')
          || lk.includes('credential') || lk.includes('_key') || lk.includes('_pass')
          || lk.includes('_pwd') || lk.includes('passphrase') || lk.includes('bearer')
          || lk.includes('oauth') || lk.includes('jwt') || lk.includes('signing')
          || lk.includes('private') || lk.includes('connection_uri') || lk.includes('database_url')
          || lk.includes('redis_url') || lk.includes('mongo_uri')
          || lk.includes('cert') || lk.includes('hmac') || lk.includes('auth_code')) {
        delete safeOutputs[key];
      }
    }
    const safeResult = { ...result, outputs: safeOutputs };

    sseWrite(`data: ${JSON.stringify({ step: 'complete', status: result.success ? 'done' : 'error', message: result.success ? 'Provisioning complete' : result.error || 'Provisioning failed', result: safeResult, runId })}\n\n`);
  } catch (err) {
    const errMsg = (err as Error).message;
    console.error('Provisioning fatal error:', errMsg);
    await updateManifestStatus(runId, 'failed');
    // Include sanitized error detail so the user can act on it (UX H-01)
    const safeErrMsg = errMsg.replace(/[A-Za-z0-9+/=]{16,}/g, '***'); // Strip tokens (16+ chars, IG-R2)
    sseWrite(`data: ${JSON.stringify({ step: 'fatal', status: 'error', message: 'Provisioning failed unexpectedly. Check that credentials are valid and try again.', detail: safeErrMsg })}\n\n`);
  } finally {
    activeProvisionRun = null;
    clearInterval(keepaliveTimer);
    sseWrite('data: [DONE]\n\n');
    sseEnd();
  }
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

// GET /api/deploys — list recent deploy history (ADR-021)
addRoute('GET', '/api/deploys', async (_req: IncomingMessage, res: ServerResponse) => {
  const password = getSessionPassword();
  if (!password) {
    sendJson(res, 401, { error: 'Vault is locked.' });
    return;
  }

  const deploys = await listDeploys();
  sendJson(res, 200, {
    deploys: deploys.map(d => ({
      timestamp: d.timestamp,
      target: d.target,
      projectName: d.projectName,
      deployUrl: d.deployUrl,
      hostname: d.hostname,
      resourceCount: d.resources.length,
    })),
  });
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
