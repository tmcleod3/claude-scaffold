/** Provisioning API — main SSE-streamed provisioning orchestration. */
import type { IncomingMessage, ServerResponse } from 'node:http';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { realpath } from 'node:fs/promises';
import { addRoute } from '../router.js';
import { getSessionPassword } from './credentials.js';
import { parseJsonBody } from '../lib/body-parser.js';
import type { ProvisionContext, ProvisionEvent } from '../lib/provisioners/types.js';
import { provisioners, GITHUB_LINKED_TARGETS, GITHUB_OPTIONAL_TARGETS } from '../lib/provisioner-registry.js';
import { createManifest, updateManifestStatus } from '../lib/provision-manifest.js';
import { provisionDns } from '../lib/dns/cloudflare-dns.js';
import { registerDomain } from '../lib/dns/cloudflare-registrar.js';
import { prepareGithub } from '../lib/github.js';
import { sshDeploy } from '../lib/ssh-deploy.js';
import { s3Deploy } from '../lib/s3-deploy.js';
import { runBuildStep, getBuildOutputDir } from '../lib/build-step.js';
import { emitCostEstimate } from '../lib/cost-estimator.js';
import { sendJson } from '../lib/http-helpers.js';
import {
  provisionRuns, activeProvisionRun, setActiveProvisionRun,
  scopeCredentials, loadCredentials, stripSecrets, buildCleanupCredentials,
} from './provision-validate.js';
import { runPostProvisionSteps } from './provision-steps.js';

// Barrel imports — load split route files
import './provision-validate.js';
import './provision-status.js';

const HOSTNAME_RE = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$/i;

// POST /api/provision/start — SSE stream provisioning events
addRoute('POST', '/api/provision/start', async (req: IncomingMessage, res: ServerResponse) => {
  const password = getSessionPassword();
  if (!password) { sendJson(res, 401, { error: 'Vault is locked.' }); return; }

  // Parse and validate BEFORE acquiring the lock (IG-R2)
  const body = await parseJsonBody(req) as {
    projectDir?: string; projectName?: string; deployTarget?: string;
    framework?: string; database?: string; cache?: string;
    instanceType?: string; hostname?: string; registerDomain?: boolean;
  };
  if (body.hostname && !HOSTNAME_RE.test(body.hostname)) {
    sendJson(res, 400, { error: 'Invalid hostname format. Expected something like: myapp.example.com' }); return;
  }
  if (!body.projectDir || !body.projectName || !body.deployTarget) {
    sendJson(res, 400, { error: 'projectDir, projectName, and deployTarget are required' }); return;
  }
  if (!body.projectDir.startsWith('/') || body.projectDir.includes('..')) {
    sendJson(res, 400, { error: 'projectDir must be an absolute path with no ".." segments' }); return;
  }
  try { body.projectDir = await realpath(body.projectDir); } catch {
    sendJson(res, 400, { error: 'Could not resolve project directory path' }); return;
  }
  const provisioner = provisioners[body.deployTarget];
  if (!provisioner) { sendJson(res, 400, { error: `Unknown deploy target: ${body.deployTarget}` }); return; }

  // Load credentials BEFORE lock (IG-R3)
  let allCredentials: Record<string, string>;
  try { allCredentials = await loadCredentials(password); } catch {
    sendJson(res, 500, { error: 'Failed to load credentials from vault' }); return;
  }

  const scopedCreds = scopeCredentials(allCredentials, body.deployTarget);
  const runId = randomUUID();
  const ctx: ProvisionContext = {
    runId, projectDir: body.projectDir, projectName: body.projectName,
    deployTarget: body.deployTarget, framework: (body.framework || 'express').toLowerCase(),
    database: body.database || 'none', cache: body.cache || 'none',
    instanceType: body.instanceType || 't3.micro', hostname: body.hostname || '',
    credentials: scopedCreds,
  };

  const errors = await provisioner.validate(ctx);
  if (errors.length > 0) { sendJson(res, 400, { error: errors.join('; ') }); return; }
  if (activeProvisionRun) {
    sendJson(res, 429, { error: 'A provisioning run is already in progress. Wait for it to complete.' }); return;
  }
  setActiveProvisionRun(runId);

  // Start SSE stream
  res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive' });
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
  req.on('close', () => { clientDisconnected = true; abortController.abort(); clearInterval(keepaliveTimer); });
  const keepaliveTimer = setInterval(() => { sseWrite(': keepalive\n\n'); }, 15000);
  let eventId = 0;
  const emit = (event: ProvisionEvent): void => { eventId++; sseWrite(`id: ${eventId}\ndata: ${JSON.stringify(event)}\n\n`); };
  const region = allCredentials['aws-region'] || 'us-east-1';
  await createManifest(runId, body.deployTarget, region, body.projectName);
  const sharedOutputs: Record<string, string> = {};

  try {
    // ── GitHub pre-step (ADR-011) ───────────────────────────
    const hasGithub = allCredentials['github-token'];
    const needsGithub = GITHUB_LINKED_TARGETS.includes(body.deployTarget);
    const wantsGithub = GITHUB_OPTIONAL_TARGETS.includes(body.deployTarget);
    if (hasGithub && (needsGithub || wantsGithub)) {
      const ghResult = await prepareGithub(
        runId, allCredentials['github-token'], allCredentials['github-owner'] || null,
        body.projectName, body.projectDir, emit, abortController.signal, ctx.framework, body.deployTarget,
      );
      if (ghResult.success) {
        sharedOutputs['GITHUB_REPO_URL'] = ghResult.repoUrl!;
        sharedOutputs['GITHUB_OWNER'] = ghResult.owner!;
        sharedOutputs['GITHUB_REPO_NAME'] = ghResult.repoName!;
      } else if (needsGithub) {
        emit({ step: 'github-warning', status: 'error', message: `GitHub setup failed — ${body.deployTarget} project will be created without auto-deploy. Push manually later.`, detail: ghResult.error });
      }
    } else if (!hasGithub && needsGithub) {
      emit({ step: 'github-skip', status: 'skipped', message: `No GitHub token in vault. ${body.deployTarget} project will be created without auto-deploy. Add GitHub credentials for CI/CD.` });
    }
    if (sharedOutputs['GITHUB_OWNER']) {
      ctx.credentials['_github-owner'] = sharedOutputs['GITHUB_OWNER'];
      ctx.credentials['_github-repo-name'] = sharedOutputs['GITHUB_REPO_NAME'];
    }

    emitCostEstimate(body.deployTarget, ctx.instanceType, ctx.database, ctx.cache, emit);
    const result = await provisioner.provision(ctx, emit);
    for (const [k, v] of Object.entries(sharedOutputs)) { result.outputs[k] = v; }

    // ── Pre-deploy build step (ADR-016) ─────────────────────
    if (result.success && body.deployTarget !== 'docker') {
      const buildResult = await runBuildStep(body.projectDir, ctx.framework, emit, abortController.signal);
      if (!buildResult.success) {
        emit({ step: 'build-fatal', status: 'error', message: 'Build failed — infrastructure was created, but code deploy will be skipped. Fix the build locally and deploy manually.', detail: buildResult.error });
      }
    }

    // ── Deploy post-step (v3.8.0 Last Mile) ─────────────────
    if (result.success && body.deployTarget === 'vps') {
      const sshHost = result.outputs['SSH_HOST'];
      if (sshHost) {
        const deployResult = await sshDeploy(body.projectDir, sshHost, result.outputs['SSH_USER'] || 'ec2-user', result.outputs['SSH_KEY_PATH'] || '.ssh/deploy-key.pem', ctx.hostname || undefined, ctx.framework, emit, abortController.signal);
        if (deployResult.deployUrl) result.outputs['DEPLOY_URL'] = deployResult.deployUrl;
      } else {
        emit({ step: 'deploy-skip', status: 'skipped', message: 'No SSH host available — SSH deploy skipped' });
      }
    } else if (result.success && body.deployTarget === 'static') {
      const bucket = result.outputs['S3_BUCKET'], websiteUrl = result.outputs['S3_WEBSITE_URL'];
      const awsKeyId = allCredentials['aws-access-key-id'], awsSecret = allCredentials['aws-secret-access-key'];
      if (bucket && websiteUrl && awsKeyId && awsSecret) {
        const s3Result = await s3Deploy(bucket, join(body.projectDir, getBuildOutputDir(ctx.framework)), allCredentials['aws-region'] || 'us-east-1', { accessKeyId: awsKeyId, secretAccessKey: awsSecret }, websiteUrl, emit);
        if (s3Result.deployUrl) result.outputs['DEPLOY_URL'] = s3Result.deployUrl;
      } else {
        emit({ step: 'deploy-skip', status: 'skipped', message: 'No S3 bucket available — upload skipped' });
      }
    } else if (result.success && ['vercel', 'cloudflare', 'railway'].includes(body.deployTarget)) {
      const deployUrl = result.outputs['DEPLOY_URL'] || result.outputs['VERCEL_DOMAIN'] || result.outputs['CF_PROJECT_URL'] || result.outputs['RAILWAY_DOMAIN'];
      if (deployUrl && !result.outputs['DEPLOY_URL']) {
        result.outputs['DEPLOY_URL'] = deployUrl.startsWith('http') ? deployUrl : `https://${deployUrl}`;
      }
    }

    // Domain registration — pre-DNS step (non-fatal, irreversible)
    const cfToken = allCredentials['cloudflare-api-token'], cfAccount = allCredentials['cloudflare-account-id'];
    if (result.success && body.registerDomain && ctx.hostname && cfToken && cfAccount) {
      const regResult = await registerDomain(cfToken, cfAccount, ctx.hostname, emit);
      if (regResult.success) {
        result.outputs['REGISTRAR_DOMAIN'] = regResult.domain || ctx.hostname;
        if (regResult.expiresAt) result.outputs['REGISTRAR_EXPIRY'] = regResult.expiresAt;
      }
    } else if (result.success && body.registerDomain && ctx.hostname && !cfAccount) {
      emit({ step: 'registrar-skip', status: 'skipped', message: 'Domain registration requested but no Cloudflare Account ID in vault. Add it in Cloud Providers.' });
    } else if (result.success && body.registerDomain && ctx.hostname && !cfToken) {
      emit({ step: 'registrar-skip', status: 'skipped', message: 'Domain registration requested but no Cloudflare API token in vault. Add Cloudflare credentials to enable registration.' });
    }

    // DNS post-provision step (non-fatal)
    if (result.success && ctx.hostname && cfToken) {
      const dnsResult = await provisionDns(runId, cfToken, ctx.hostname, body.deployTarget, result.outputs, emit);
      if (dnsResult.records.length > 0) {
        for (const record of dnsResult.records) {
          result.resources.push({ type: 'dns-record', id: `${dnsResult.zoneId}:${record.id}`, region: 'global' });
        }
        result.outputs['DNS_HOSTNAME'] = ctx.hostname;
        result.outputs['DNS_ZONE_ID'] = dnsResult.zoneId;
      }
    } else if (result.success && ctx.hostname && !cfToken) {
      emit({ step: 'dns-skip', status: 'skipped', message: `Hostname "${ctx.hostname}" set but no Cloudflare token in vault. Add Cloudflare credentials to enable DNS wiring.` });
    }

    // Post-provision finalization (sentry, env-validator, health, deploy log)
    if (result.success) {
      await runPostProvisionSteps({
        projectDir: body.projectDir, framework: ctx.framework, deployTarget: body.deployTarget,
        projectName: body.projectName, hostname: ctx.hostname, region, runId,
        outputs: result.outputs, resources: result.resources,
        sentryDsn: allCredentials['sentry-dsn'], emit,
      });
    }

    // Track for cleanup by run ID
    if (result.resources.length > 0) {
      const hasDns = result.resources.some(r => r.type === 'dns-record');
      provisionRuns.set(runId, { resources: result.resources, credentials: buildCleanupCredentials(body.deployTarget, allCredentials, hasDns), target: body.deployTarget });
    }
    await updateManifestStatus(runId, result.success ? 'complete' : 'failed');
    const safeResult = { ...result, outputs: stripSecrets(result.outputs) };
    sseWrite(`data: ${JSON.stringify({ step: 'complete', status: result.success ? 'done' : 'error', message: result.success ? 'Provisioning complete' : result.error || 'Provisioning failed', result: safeResult, runId })}\n\n`);
  } catch (err) {
    const errMsg = (err as Error).message;
    console.error('Provisioning fatal error:', errMsg);
    await updateManifestStatus(runId, 'failed');
    sseWrite(`data: ${JSON.stringify({ step: 'fatal', status: 'error', message: 'Provisioning failed unexpectedly. Check that credentials are valid and try again.', detail: errMsg.replace(/[A-Za-z0-9+/=]{16,}/g, '***') })}\n\n`);
  } finally {
    setActiveProvisionRun(null);
    clearInterval(keepaliveTimer);
    sseWrite('data: [DONE]\n\n');
    sseEnd();
  }
});
