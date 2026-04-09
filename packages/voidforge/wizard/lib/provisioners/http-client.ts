/**
 * Shared HTTPS client for provisioner API calls.
 * Uses raw node:https — no dependencies.
 *
 * Security: All callers hardcode hostnames (api.cloudflare.com, etc.).
 * Never pass user-controlled input as the hostname parameter.
 */

import { request as httpsRequest } from 'node:https';

interface HttpResponse {
  status: number;
  body: string;
}

export function httpsGet(hostname: string, path: string, headers: Record<string, string>, timeout?: number): Promise<HttpResponse> {
  return httpsCallWithRetry('GET', hostname, path, headers, undefined, timeout);
}

export function httpsPost(hostname: string, path: string, headers: Record<string, string>, body?: string, timeout?: number): Promise<HttpResponse> {
  return httpsCallWithRetry('POST', hostname, path, headers, body, timeout);
}

export function httpsPut(hostname: string, path: string, headers: Record<string, string>, body?: string, timeout?: number): Promise<HttpResponse> {
  return httpsCallWithRetry('PUT', hostname, path, headers, body, timeout);
}

export function httpsDelete(hostname: string, path: string, headers: Record<string, string>, timeout?: number): Promise<HttpResponse> {
  return httpsCallWithRetry('DELETE', hostname, path, headers, undefined, timeout);
}

/** Slugify a name for use as a cloud resource identifier. Strips non-alphanumeric, trims hyphens. */
export function slugify(name: string): string {
  const slug = name.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0, 40);
  return slug || 'voidforge-project';
}

/** Safely parse JSON — returns null on invalid input instead of throwing. */
export function safeJsonParse(body: string): unknown {
  try { return JSON.parse(body); } catch { return null; }
}

const DEFAULT_TIMEOUT = 30000;
const MAX_RETRIES = 1;
const RETRY_DELAY_MS = 2000;
const TRANSIENT_CODES = ['ECONNRESET', 'ETIMEDOUT', 'ENOTFOUND', 'EPIPE'];

/**
 * Wrapper around httpsCall that retries once on transient network errors.
 * Transient errors: ECONNRESET, ETIMEDOUT, ENOTFOUND, EPIPE, socket hang up.
 */
async function httpsCallWithRetry(
  method: string,
  hostname: string,
  path: string,
  headers: Record<string, string>,
  body?: string,
  timeout?: number,
): Promise<HttpResponse> {
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await httpsCall(method, hostname, path, headers, body, timeout);
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      const isTransient = TRANSIENT_CODES.includes(code || '') ||
        (err as Error).message.includes('socket hang up');
      if (attempt < MAX_RETRIES && isTransient) {
        await new Promise(r => setTimeout(r, RETRY_DELAY_MS));
        continue;
      }
      throw err;
    }
  }
  // Unreachable — the loop always returns or throws — but TypeScript needs this
  throw new Error('Retry loop exited unexpectedly');
}

function httpsCall(method: string, hostname: string, path: string, headers: Record<string, string>, body?: string, timeout?: number): Promise<HttpResponse> {
  return new Promise((resolve, reject) => {
    const opts: Record<string, unknown> = { hostname, path, method, headers, timeout: timeout ?? DEFAULT_TIMEOUT };
    if (body) {
      headers['Content-Length'] = String(Buffer.byteLength(body));
    }
    const req = httpsRequest(opts, (res) => {
      let data = '';
      res.on('data', (chunk: Buffer) => { data += chunk.toString(); });
      res.on('end', () => resolve({ status: res.statusCode ?? 0, body: data }));
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Request timed out')); });
    if (body) req.write(body);
    req.end();
  });
}
