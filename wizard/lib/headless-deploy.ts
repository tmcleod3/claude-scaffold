/**
 * Headless deploy — runs the same provisioner pipeline as Haku,
 * but outputs progress to stdout instead of SSE to a browser.
 * Called by: `npx voidforge deploy --headless`
 * Used by: /build Phase 12 (Kusanagi)
 */

import { readFile, access } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { createInterface } from 'node:readline';
import { parseFrontmatter } from './frontmatter.js';
import { recommendInstanceType } from './instance-sizing.js';
import { vaultUnlock, vaultGet, vaultKeys } from './vault.js';
import { createManifest, updateManifestStatus } from './provision-manifest.js';
import { emitCostEstimate } from './cost-estimator.js';
import { runBuildStep, getBuildOutputDir } from './build-step.js';
import { generateEnvValidator } from './env-validator.js';
import { logDeploy } from './deploy-log.js';
import { setupHealthMonitoring } from './health-monitor.js';
import { sshDeploy } from './ssh-deploy.js';
import { s3Deploy } from './s3-deploy.js';
import { prepareGithub } from './github.js';
import { provisionDns } from './dns/cloudflare-dns.js';
import { generateSentryInit } from './sentry-generator.js';
import type { ProvisionContext, ProvisionEvent, Provisioner, ProvisionResult } from './provisioners/types.js';
import { dockerProvisioner } from './provisioners/docker.js';
import { awsVpsProvisioner } from './provisioners/aws-vps.js';
import { vercelProvisioner } from './provisioners/vercel.js';
import { railwayProvisioner } from './provisioners/railway.js';
import { cloudflareProvisioner } from './provisioners/cloudflare.js';
import { staticS3Provisioner } from './provisioners/static-s3.js';

const provisioners: Record<string, Provisioner> = {
  docker: dockerProvisioner,
  vps: awsVpsProvisioner,
  vercel: vercelProvisioner,
  railway: railwayProvisioner,
  cloudflare: cloudflareProvisioner,
  static: staticS3Provisioner,
};

/** Credential scoping — same as provision.ts (ADR-020). */
const provisionKeys: Record<string, string[]> = {
  vps: ['aws-access-key-id', 'aws-secret-access-key', 'aws-region'],
  static: ['aws-access-key-id', 'aws-secret-access-key', 'aws-region'],
  vercel: ['vercel-token'],
  railway: ['railway-token'],
  cloudflare: ['cloudflare-api-token', 'cloudflare-account-id'],
  docker: [],
};

const GITHUB_LINKED_TARGETS = ['vercel', 'cloudflare', 'railway'];
const GITHUB_OPTIONAL_TARGETS = ['vps', 'static'];

function log(icon: string, message: string): void {
  console.log(`  ${icon} ${message}`);
}

function emit(event: ProvisionEvent): void {
  const icons: Record<string, string> = {
    done: '\x1b[32m✓\x1b[0m',
    error: '\x1b[31m✗\x1b[0m',
    skipped: '\x1b[33m→\x1b[0m',
    pending: '\x1b[36m…\x1b[0m',
  };
  const icon = icons[event.status] || '·';
  const detail = event.detail ? ` (${event.detail})` : '';
  console.log(`  ${icon} [${event.step}] ${event.message}${detail}`);
}

async function promptPassword(): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    // Hide input for password
    process.stdout.write('  Vault password: ');
    const stdin = process.stdin;
    const wasRaw = stdin.isRaw;
    if (stdin.isTTY && stdin.setRawMode) {
      stdin.setRawMode(true);
    }

    let password = '';
    const onData = (ch: Buffer) => {
      const c = ch.toString();
      if (c === '\n' || c === '\r') {
        stdin.removeListener('data', onData);
        if (stdin.isTTY && stdin.setRawMode) stdin.setRawMode(wasRaw ?? false);
        process.stdout.write('\n');
        rl.close();
        resolve(password);
      } else if (c === '\u007f' || c === '\b') {
        password = password.slice(0, -1);
      } else if (c === '\u0003') {
        // Ctrl+C
        process.exit(1);
      } else {
        password += c;
      }
    };
    stdin.on('data', onData);
  });
}

/**
 * Env-only deploy — write vault credentials to .env without provisioning infrastructure.
 * Reads PRD frontmatter to identify required env vars, pulls matching values from the vault,
 * and appends them to the project's .env file.
 * Called by: `npx voidforge deploy --env-only`
 */
export async function envOnlyDeploy(projectDir?: string): Promise<void> {
  const dir = projectDir || process.cwd();

  console.log('');
  console.log('  \x1b[1mVoidForge — Env-Only Deploy (Vault → .env)\x1b[0m');
  console.log('');

  // Verify this is a VoidForge project
  try {
    await access(join(dir, 'CLAUDE.md'));
  } catch {
    log('✗', 'Not a VoidForge project — no CLAUDE.md found');
    process.exit(1);
  }

  // Verify PRD exists (env-only still requires a project with a PRD)
  try {
    await access(join(dir, 'docs', 'PRD.md'));
  } catch {
    log('✗', 'No PRD found at docs/PRD.md');
    process.exit(1);
  }

  // Unlock vault
  const password = process.env['VOIDFORGE_VAULT_PASSWORD'] || await promptPassword();
  const valid = await vaultUnlock(password);
  if (!valid) {
    log('✗', 'Wrong vault password');
    process.exit(1);
  }
  log('🔓', 'Vault unlocked');

  // Load all vault keys
  const keys = await vaultKeys(password);
  const envKeys = keys.filter(k => k.startsWith('env:'));
  const infraKeys = keys.filter(k => !k.startsWith('env:'));

  if (envKeys.length === 0 && infraKeys.length === 0) {
    log('→', 'Vault is empty — nothing to write');
    return;
  }

  // Read existing .env to avoid duplicates
  const envPath = join(dir, '.env');
  let existingEnv = '';
  try {
    existingEnv = await readFile(envPath, 'utf-8');
  } catch { /* no .env yet */ }

  // Build env entries from vault
  const lines: string[] = [];
  // Track written env names to prevent env:/infra collision duplicates
  const writtenNames = new Set<string>();
  let written = 0;
  let skipped = 0;

  /** Check if an env var name already exists in the .env file (line-anchored match) */
  function envExists(name: string): boolean {
    return new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}=`, 'm').test(existingEnv);
  }

  /** Quote a value for .env — escape newlines, quotes, and backslashes */
  function quoteValue(val: string): string {
    if (/[\n\r"\\$`#\s]/.test(val)) {
      return `"${val.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\$/g, '\\$').replace(/`/g, '\\`').replace(/\n/g, '\\n').replace(/\r/g, '\\r')}"`;
    }
    return val;
  }

  // env:-prefixed keys → strip prefix, use as env var name directly
  for (const key of envKeys) {
    const envName = key.slice(4); // strip "env:"
    if (envExists(envName) || writtenNames.has(envName)) {
      skipped++;
      continue;
    }
    const val = await vaultGet(password, key);
    if (val !== null) {
      lines.push(`${envName}=${quoteValue(val)}`);
      writtenNames.add(envName);
      written++;
    }
  }

  // Hyphenated infra keys → map to env var equivalents
  const infraMap: Record<string, string> = {
    'anthropic-api-key': 'ANTHROPIC_API_KEY',
    'aws-access-key-id': 'AWS_ACCESS_KEY_ID',
    'aws-secret-access-key': 'AWS_SECRET_ACCESS_KEY',
    'aws-region': 'AWS_REGION',
    'vercel-token': 'VERCEL_TOKEN',
    'railway-token': 'RAILWAY_TOKEN',
    'cloudflare-api-token': 'CLOUDFLARE_API_TOKEN',
    'cloudflare-account-id': 'CLOUDFLARE_ACCOUNT_ID',
    'cloudflare-zone-id': 'CLOUDFLARE_ZONE_ID',
    'github-token': 'GITHUB_TOKEN',
    'sentry-dsn': 'SENTRY_DSN',
  };

  for (const key of infraKeys) {
    const envName = infraMap[key];
    if (!envName) continue; // unknown infra key, skip
    if (envExists(envName) || writtenNames.has(envName)) {
      skipped++;
      continue;
    }
    const val = await vaultGet(password, key);
    if (val !== null) {
      lines.push(`${envName}=${quoteValue(val)}`);
      writtenNames.add(envName);
      written++;
    }
  }

  if (lines.length === 0) {
    log('→', `All ${skipped} vault keys already in .env — nothing to write`);
    return;
  }

  // Append to .env with restricted permissions (0o600 — owner only, matches vault.ts)
  const section = `\n# --- VoidForge vault (${new Date().toISOString().slice(0, 10)}) ---\n${lines.join('\n')}\n`;
  const { open: openFile } = await import('node:fs/promises');
  const content = existingEnv + section;
  const fh = await openFile(envPath, 'w', 0o600);
  try {
    await fh.writeFile(content, 'utf-8');
    await fh.sync();
  } finally {
    await fh.close();
  }

  log('✓', `Wrote ${written} env vars to .env (${skipped} already present)`);
  console.log('');
}

export async function headlessDeploy(projectDir?: string): Promise<void> {
  const dir = projectDir || process.cwd();

  console.log('');
  console.log('  \x1b[1mVoidForge — Headless Deploy (Haku CLI)\x1b[0m');
  console.log('');

  // --- Scan project ---
  log('📂', `Scanning project: ${dir}`);

  try {
    await access(join(dir, 'CLAUDE.md'));
  } catch {
    log('✗', 'Not a VoidForge project — no CLAUDE.md found');
    process.exit(1);
  }

  // Read project name
  let name = 'Unknown';
  try {
    const claudeMd = await readFile(join(dir, 'CLAUDE.md'), 'utf-8');
    const nameMatch = claudeMd.match(/\*\*Name:\*\*\s*(.+)/);
    if (nameMatch) {
      const extracted = nameMatch[1].trim();
      if (!extracted.startsWith('[')) name = extracted;
    }
  } catch { /* use default */ }

  // Read deploy target from .env
  let deploy = '';
  let hostname = '';
  try {
    const envContent = await readFile(join(dir, '.env'), 'utf-8');
    const deployMatch = envContent.match(/DEPLOY_TARGET=["']?([^"'\s#]+)/);
    if (deployMatch) deploy = deployMatch[1];
    const hostnameMatch = envContent.match(/HOSTNAME=["']?([^"'\s#]+)/);
    if (hostnameMatch) hostname = hostnameMatch[1];
  } catch { /* no .env */ }

  // Read PRD frontmatter
  let framework = '';
  let database = 'none';
  let cache = 'none';
  let instanceType = '';
  let prdFrontmatter: Record<string, string | undefined> = {};
  try {
    const prd = await readFile(join(dir, 'docs', 'PRD.md'), 'utf-8');
    const { frontmatter } = parseFrontmatter(prd);
    prdFrontmatter = frontmatter;
    if (frontmatter.framework) framework = frontmatter.framework;
    if (frontmatter.database) database = frontmatter.database;
    if (frontmatter.cache) cache = frontmatter.cache;
    if (frontmatter.deploy && !deploy) deploy = frontmatter.deploy;
    if (frontmatter.hostname && !hostname) hostname = frontmatter.hostname;
    if (frontmatter.instance_type) instanceType = frontmatter.instance_type;
  } catch { /* no PRD */ }

  if (!deploy) deploy = 'docker';

  if (!instanceType && (deploy === 'vps' || !deploy)) {
    instanceType = recommendInstanceType({
      type: prdFrontmatter.type,
      framework,
      database,
      cache,
      workers: prdFrontmatter.workers,
      payments: prdFrontmatter.payments,
    });
  }

  log('📋', `Project: ${name}`);
  log('🔧', `Framework: ${framework || 'auto-detect'} | DB: ${database} | Cache: ${cache}`);
  log('🎯', `Deploy target: ${deploy} | Instance: ${instanceType || 'N/A'}`);
  if (hostname) log('🌐', `Hostname: ${hostname}`);
  console.log('');

  // --- Unlock vault ---
  const password = await promptPassword();
  const valid = await vaultUnlock(password);
  if (!valid) {
    log('✗', 'Wrong vault password');
    process.exit(1);
  }
  log('🔓', 'Vault unlocked');

  // --- Load credentials ---
  const keys = await vaultKeys(password);
  const allCredentials: Record<string, string> = {};
  for (const key of keys) {
    const val = await vaultGet(password, key);
    if (val) allCredentials[key] = val;
  }

  // Scope credentials
  const allowed = provisionKeys[deploy] || [];
  const scopedCreds: Record<string, string> = {};
  for (const key of allowed) {
    if (allCredentials[key]) scopedCreds[key] = allCredentials[key];
  }

  // --- Provision ---
  const provisioner = provisioners[deploy];
  if (!provisioner) {
    log('✗', `Unknown deploy target: ${deploy}`);
    process.exit(1);
  }

  const runId = randomUUID();
  const ctx: ProvisionContext = {
    runId,
    projectDir: dir,
    projectName: name,
    deployTarget: deploy,
    framework: framework || 'express',
    database,
    cache,
    instanceType: instanceType || 't3.micro',
    hostname,
    credentials: scopedCreds,
  };

  const errors = await provisioner.validate(ctx);
  if (errors.length > 0) {
    log('✗', `Validation failed: ${errors.join('; ')}`);
    process.exit(1);
  }

  const region = allCredentials['aws-region'] || 'us-east-1';
  await createManifest(runId, deploy, region, name);

  console.log('');
  log('🚀', 'Starting provisioning...');
  console.log('');

  // Cost estimate
  emitCostEstimate(deploy, ctx.instanceType, database, cache, emit);

  // GitHub pre-step
  const sharedOutputs: Record<string, string> = {};
  const hasGithub = allCredentials['github-token'];
  const needsGithub = GITHUB_LINKED_TARGETS.includes(deploy);
  const wantsGithub = GITHUB_OPTIONAL_TARGETS.includes(deploy);

  if (hasGithub && (needsGithub || wantsGithub)) {
    const ghResult = await prepareGithub(
      runId, allCredentials['github-token'], allCredentials['github-owner'] || null,
      name, dir, emit, AbortSignal.timeout(120000), framework, deploy,
    );
    if (ghResult.success) {
      sharedOutputs['GITHUB_REPO_URL'] = ghResult.repoUrl!;
      sharedOutputs['GITHUB_OWNER'] = ghResult.owner!;
      sharedOutputs['GITHUB_REPO_NAME'] = ghResult.repoName!;
    }
  }

  if (sharedOutputs['GITHUB_OWNER']) {
    ctx.credentials['_github-owner'] = sharedOutputs['GITHUB_OWNER'];
    ctx.credentials['_github-repo-name'] = sharedOutputs['GITHUB_REPO_NAME'];
  }

  // Provision infrastructure
  let result: ProvisionResult;
  try {
    result = await provisioner.provision(ctx, emit);
  } catch (err) {
    await updateManifestStatus(runId, 'failed');
    log('✗', `Provisioning failed: ${(err as Error).message}`);
    process.exit(1);
  }

  if (!result.success) {
    await updateManifestStatus(runId, 'failed');
    log('✗', `Provisioning failed: ${result.error || 'Unknown error'}`);
    process.exit(1);
  }

  // Merge GitHub outputs
  for (const [k, v] of Object.entries(sharedOutputs)) {
    result.outputs[k] = v;
  }

  // Pre-deploy build step
  if (deploy !== 'docker') {
    const buildResult = await runBuildStep(dir, framework, emit, AbortSignal.timeout(300000));
    if (!buildResult.success) {
      emit({ step: 'build-warning', status: 'error', message: 'Build failed — deploy may be incomplete', detail: buildResult.error });
    }
  }

  // Deploy post-step
  if (deploy === 'vps') {
    const sshHost = result.outputs['SSH_HOST'];
    const sshUser = result.outputs['SSH_USER'] || 'ec2-user';
    const sshKey = result.outputs['SSH_KEY_PATH'] || '.ssh/deploy-key.pem';
    if (sshHost) {
      const deployResult = await sshDeploy(dir, sshHost, sshUser, sshKey, hostname || undefined, framework, emit, AbortSignal.timeout(300000));
      if (deployResult.deployUrl) result.outputs['DEPLOY_URL'] = deployResult.deployUrl;
    }
  } else if (deploy === 'static') {
    const bucket = result.outputs['S3_BUCKET'];
    const websiteUrl = result.outputs['S3_WEBSITE_URL'];
    if (bucket && websiteUrl && allCredentials['aws-access-key-id'] && allCredentials['aws-secret-access-key']) {
      const s3Result = await s3Deploy(
        bucket, join(dir, getBuildOutputDir(framework)), region,
        { accessKeyId: allCredentials['aws-access-key-id'], secretAccessKey: allCredentials['aws-secret-access-key'] },
        websiteUrl, emit,
      );
      if (s3Result.deployUrl) result.outputs['DEPLOY_URL'] = s3Result.deployUrl;
    }
  } else {
    const deployUrl = result.outputs['DEPLOY_URL'] || result.outputs['VERCEL_DOMAIN'] || result.outputs['CF_PROJECT_URL'] || result.outputs['RAILWAY_DOMAIN'];
    if (deployUrl && !result.outputs['DEPLOY_URL']) {
      result.outputs['DEPLOY_URL'] = deployUrl.startsWith('http') ? deployUrl : `https://${deployUrl}`;
    }
  }

  // DNS
  if (hostname && allCredentials['cloudflare-api-token']) {
    await provisionDns(runId, allCredentials['cloudflare-api-token'], hostname, deploy, result.outputs, emit);
  }

  // Sentry
  await generateSentryInit(dir, framework, allCredentials['sentry-dsn'], emit);

  // Env validator
  await generateEnvValidator(dir, framework);

  // Health monitoring
  await setupHealthMonitoring(deploy, dir, name, result.outputs['DEPLOY_URL'] || '', result.outputs, emit);

  // Deploy log
  try {
    await logDeploy({
      runId,
      timestamp: new Date().toISOString(),
      target: deploy,
      projectName: name,
      framework,
      deployUrl: result.outputs['DEPLOY_URL'] || '',
      hostname,
      region,
      resources: result.resources.map(r => ({ type: r.type, id: r.id })),
      outputs: Object.fromEntries(
        Object.entries(result.outputs).filter(([k]) =>
          !k.toLowerCase().includes('password') && !k.toLowerCase().includes('secret') && !k.toLowerCase().includes('token')
        )
      ),
    });
  } catch { /* non-fatal */ }

  await updateManifestStatus(runId, 'complete');

  // --- Done ---
  console.log('');
  console.log('  \x1b[32m═══════════════════════════════════════════\x1b[0m');
  console.log('  \x1b[32m  Deploy complete!\x1b[0m');
  if (result.outputs['DEPLOY_URL']) {
    console.log(`  \x1b[32m  URL: ${result.outputs['DEPLOY_URL']}\x1b[0m`);
  }
  if (result.outputs['SSH_HOST']) {
    console.log(`  \x1b[36m  SSH: ssh ${result.outputs['SSH_USER'] || 'ec2-user'}@${result.outputs['SSH_HOST']}\x1b[0m`);
  }
  console.log('  \x1b[32m═══════════════════════════════════════════\x1b[0m');
  console.log('');
}
