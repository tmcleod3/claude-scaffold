/**
 * Provisioning API — shared state, credential helpers, cleanup route.
 * Split from provision.ts for file size (v23.3).
 */

import type { IncomingMessage, ServerResponse } from 'node:http';
import { addRoute } from '../router.js';
import { getSessionPassword } from './credentials.js';
import { vaultGet, vaultKeys } from '../lib/vault.js';
import { parseJsonBody } from '../lib/body-parser.js';
import type { CreatedResource } from '../lib/provisioners/types.js';
import { provisioners, provisionKeys } from '../lib/provisioner-registry.js';
import {
  updateManifestStatus, readManifest, deleteManifest,
  manifestToCreatedResources,
} from '../lib/provision-manifest.js';
import { cleanupDnsRecords } from '../lib/dns/cloudflare-dns.js';
import { sendJson } from '../lib/http-helpers.js';

/** Tracks resources per provisioning run by ID, keyed by runId. */
export interface ProvisionRun {
  resources: CreatedResource[];
  credentials: Record<string, string>;
  target: string;
}
export const provisionRuns = new Map<string, ProvisionRun>();

/** Concurrency lock — only one provisioning run at a time (F-02). */
export let activeProvisionRun: string | null = null;

export function setActiveProvisionRun(runId: string | null): void {
  activeProvisionRun = runId;
}

/** Scope credentials to only the keys a provisioner needs. Internal _-prefixed keys pass through. */
export function scopeCredentials(allCreds: Record<string, string>, target: string): Record<string, string> {
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

/** Secret keywords to strip from SSE outputs and deploy logs. */
const SECRET_KEYWORDS = [
  'password', 'secret', 'token', 'credential', '_key', '_pass',
  '_pwd', 'passphrase', 'bearer', 'oauth', 'jwt', 'signing',
  'private', 'connection_uri', 'database_url', 'redis_url', 'mongo_uri',
  'cert', 'hmac', 'auth_code',
];

/** Keys that are safe to include in outputs despite matching secret keywords. */
const SAFE_OUTPUT_KEYS = new Set(['DEPLOY_URL', 'S3_WEBSITE_URL', 'CF_PROJECT_URL', 'GITHUB_REPO_URL', 'SSH_KEY_PATH']);

/** Strip secret values from an outputs map, preserving allowlisted keys. */
export function stripSecrets(outputs: Record<string, string>): Record<string, string> {
  const safe = { ...outputs };
  delete safe['DB_PASSWORD'];
  delete safe['GITHUB_TOKEN'];
  for (const key of Object.keys(safe)) {
    if (SAFE_OUTPUT_KEYS.has(key)) continue;
    const lk = key.toLowerCase();
    if (SECRET_KEYWORDS.some((kw) => lk.includes(kw))) {
      delete safe[key];
    }
  }
  return safe;
}

/** Build minimal credential set needed for cleanup of a given deploy target. */
export function buildCleanupCredentials(
  target: string,
  allCreds: Record<string, string>,
  hasDnsRecords: boolean,
): Record<string, string> {
  const cleanupCreds: Record<string, string> = {};
  const cleanupKeys: Record<string, string[]> = {
    vps: ['aws-access-key-id', 'aws-secret-access-key', 'aws-region'],
    static: ['aws-access-key-id', 'aws-secret-access-key', 'aws-region'],
    vercel: ['vercel-token'],
    railway: ['railway-token'],
    cloudflare: ['cloudflare-api-token'],
    docker: [],
  };
  for (const key of (cleanupKeys[target] || [])) {
    if (allCreds[key]) cleanupCreds[key] = allCreds[key];
  }
  if (hasDnsRecords && allCreds['cloudflare-api-token']) {
    cleanupCreds['cloudflare-api-token'] = allCreds['cloudflare-api-token'];
  }
  return cleanupCreds;
}

export async function loadCredentials(password: string): Promise<Record<string, string>> {
  const keys = await vaultKeys(password);
  const creds: Record<string, string> = {};
  for (const key of keys) {
    const val = await vaultGet(password, key);
    if (val) creds[key] = val;
  }
  return creds;
}

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
