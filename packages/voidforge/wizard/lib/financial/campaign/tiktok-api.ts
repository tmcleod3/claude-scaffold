/**
 * TikTok Marketing API layer — raw HTTP calls via node:https (zero new dependencies).
 *
 * TikTok Marketing API v1.3:
 *   Base URL: https://business-api.tiktok.com/open_api/v1.3
 *   Auth: Access-Token header
 *   Rate limit: 10 calls/sec
 *
 * PRD Reference: SS9.5, SS9.19.10, SS9.20.4
 */

import { request as httpsRequest } from 'node:https';
import { safeParseJson, makePlatformError } from './campaign-common.js';

export const TIKTOK_HOST = 'business-api.tiktok.com';

// ── Config ──────────────────────────────────────────

export interface TikTokCampaignConfig {
  appId: string;       // advertiser_id
  accessToken: string;
}

// ── HTTP helpers ─────────────────────────────────────

export async function tiktokGet(
  path: string,
  accessToken: string,
  params?: Record<string, string>,
): Promise<{ status: number; body: string }> {
  const query = params
    ? '?' + new URLSearchParams(params).toString()
    : '';
  return new Promise((resolve, reject) => {
    const req = httpsRequest({
      hostname: TIKTOK_HOST,
      path: `/open_api/v1.3${path}${query}`,
      method: 'GET',
      headers: {
        'Access-Token': accessToken,
        'Accept': 'application/json',
      },
      timeout: 15000,
    }, (res) => {
      let data = '';
      res.on('data', (chunk: Buffer) => { data += chunk.toString(); });
      res.on('end', () => resolve({ status: res.statusCode ?? 500, body: data }));
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('TikTok API timeout')); });
    req.end();
  });
}

export async function tiktokPost(
  path: string,
  accessToken: string,
  body: Record<string, unknown>,
): Promise<{ status: number; body: string }> {
  const payload = JSON.stringify(body);
  return new Promise((resolve, reject) => {
    const req = httpsRequest({
      hostname: TIKTOK_HOST,
      path: `/open_api/v1.3${path}`,
      method: 'POST',
      headers: {
        'Access-Token': accessToken,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      timeout: 15000,
    }, (res) => {
      let data = '';
      res.on('data', (chunk: Buffer) => { data += chunk.toString(); });
      res.on('end', () => resolve({ status: res.statusCode ?? 500, body: data }));
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('TikTok API timeout')); });
    req.write(payload);
    req.end();
  });
}

// ── Response validation ──────────────────────────────

/** Require TikTok success (code === 0); throw typed PlatformError otherwise. */
export function requireSuccess(parsed: Record<string, unknown>, context: string): Record<string, unknown> {
  const code = parsed.code as number | undefined;
  const message = parsed.message as string ?? 'Unknown error';
  if (code !== 0) {
    if (code === 40100) {
      throw makePlatformError('tiktok', 'AUTH_EXPIRED', code, `${context}: ${message}`);
    }
    if (code === 40002 || code === 40003) {
      throw makePlatformError('tiktok', 'RATE_LIMITED', code, `${context}: ${message}`, true, 1);
    }
    if (code === 40101 || code === 40201 || message.toLowerCase().includes('budget')) {
      throw makePlatformError('tiktok', 'BUDGET_EXCEEDED', code ?? 400, `${context}: ${message}`);
    }
    throw makePlatformError('tiktok', 'UNKNOWN', code ?? 500, `${context}: ${message}`);
  }
  return parsed.data as Record<string, unknown> ?? {};
}
