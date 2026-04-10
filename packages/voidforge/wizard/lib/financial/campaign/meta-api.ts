/**
 * Meta Marketing API layer — raw HTTP calls via node:https (zero new dependencies).
 *
 * Meta Marketing API v19.0:
 *   Base URL: https://graph.facebook.com/v19.0
 *   Auth: access_token query parameter
 *   Rate limit: 200 calls/hr/ad account (sliding window)
 *
 * PRD Reference: SS9.5, SS9.19.10, SS9.20.4
 */

import { request as httpsRequest } from 'node:https';
import { safeParseJson, makePlatformError } from './campaign-common.js';

export const META_HOST = 'graph.facebook.com';

// ── Config ──────────────────────────────────────────

export interface MetaCampaignConfig {
  adAccountId: string;
  accessToken: string;
}

// ── HTTP helpers ─────────────────────────────────────

export async function metaGet(
  path: string,
  accessToken: string,
  params?: Record<string, string>,
): Promise<{ status: number; body: string }> {
  const queryParams = new URLSearchParams({ access_token: accessToken, ...params });
  const query = '?' + queryParams.toString();
  return new Promise((resolve, reject) => {
    const req = httpsRequest({
      hostname: META_HOST,
      path: `/v19.0${path}${query}`,
      method: 'GET',
      headers: { 'Accept': 'application/json' },
      timeout: 15000,
    }, (res) => {
      let data = '';
      res.on('data', (chunk: Buffer) => { data += chunk.toString(); });
      res.on('end', () => resolve({ status: res.statusCode ?? 500, body: data }));
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Meta API timeout')); });
    req.end();
  });
}

export async function metaPost(
  path: string,
  accessToken: string,
  params: Record<string, string>,
): Promise<{ status: number; body: string }> {
  const payload = new URLSearchParams({ access_token: accessToken, ...params }).toString();
  return new Promise((resolve, reject) => {
    const req = httpsRequest({
      hostname: META_HOST,
      path: `/v19.0${path}`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json',
      },
      timeout: 15000,
    }, (res) => {
      let data = '';
      res.on('data', (chunk: Buffer) => { data += chunk.toString(); });
      res.on('end', () => resolve({ status: res.statusCode ?? 500, body: data }));
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Meta API timeout')); });
    req.write(payload);
    req.end();
  });
}

export async function metaDelete(
  path: string,
  accessToken: string,
): Promise<{ status: number; body: string }> {
  const query = `?access_token=${encodeURIComponent(accessToken)}`;
  return new Promise((resolve, reject) => {
    const req = httpsRequest({
      hostname: META_HOST,
      path: `/v19.0${path}${query}`,
      method: 'DELETE',
      headers: { 'Accept': 'application/json' },
      timeout: 15000,
    }, (res) => {
      let data = '';
      res.on('data', (chunk: Buffer) => { data += chunk.toString(); });
      res.on('end', () => resolve({ status: res.statusCode ?? 500, body: data }));
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Meta API timeout')); });
    req.end();
  });
}

// ── Error classification ─────────────────────────────

export function throwMetaApiError(status: number, body: string): never {
  const parsed = safeParseJson(body);
  const errObj = parsed.error as Record<string, unknown> | undefined;
  const errMsg = errObj?.message as string ?? `HTTP ${status}`;
  const errCode = errObj?.code as number | undefined;

  if (status === 429 || errCode === 32 || errCode === 4) {
    throw makePlatformError('meta', 'RATE_LIMITED', status, errMsg, true, 60);
  }
  if (status === 401 || status === 403 || errCode === 190) {
    throw makePlatformError('meta', 'AUTH_EXPIRED', status, errMsg);
  }
  if (errCode === 2635005 || errMsg.toLowerCase().includes('budget')) {
    throw makePlatformError('meta', 'BUDGET_EXCEEDED', status, errMsg);
  }
  throw makePlatformError('meta', 'UNKNOWN', status, errMsg);
}
