/**
 * Google Ads API layer — raw HTTP calls via node:https (zero new dependencies).
 *
 * Google Ads API v17:
 *   Base URL: https://googleads.googleapis.com/v17
 *   Auth: Authorization: Bearer {accessToken} + developer-token header
 *   Rate limit: 15,000 operations/day
 *
 * PRD Reference: SS9.5, SS9.19.10, SS9.20.4
 */

import { request as httpsRequest } from 'node:https';
import type { PlatformError } from './base.js';
import { safeParseJson, makePlatformError } from './campaign-common.js';

export const GOOGLE_ADS_HOST = 'googleads.googleapis.com';

// ── Config ──────────────────────────────────────────

export interface GoogleCampaignConfig {
  customerId: string;
  accessToken: string;
  developerToken: string;
}

// ── HTTP helpers ─────────────────────────────────────

export async function googleGet(
  path: string,
  accessToken: string,
  developerToken: string,
): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const req = httpsRequest({
      hostname: GOOGLE_ADS_HOST,
      path: `/v17${path}`,
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'developer-token': developerToken,
        'Accept': 'application/json',
      },
      timeout: 15000,
    }, (res) => {
      let data = '';
      res.on('data', (chunk: Buffer) => { data += chunk.toString(); });
      res.on('end', () => resolve({ status: res.statusCode ?? 500, body: data }));
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Google Ads API timeout')); });
    req.end();
  });
}

export async function googlePost(
  path: string,
  accessToken: string,
  developerToken: string,
  body: Record<string, unknown>,
): Promise<{ status: number; body: string }> {
  const payload = JSON.stringify(body);
  return new Promise((resolve, reject) => {
    const req = httpsRequest({
      hostname: GOOGLE_ADS_HOST,
      path: `/v17${path}`,
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'developer-token': developerToken,
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
    req.on('timeout', () => { req.destroy(); reject(new Error('Google Ads API timeout')); });
    req.write(payload);
    req.end();
  });
}

// ── OAuth refresh ────────────────────────────────────

export async function googleRefreshToken(
  refreshToken: string,
): Promise<{ status: number; body: string }> {
  const payload = JSON.stringify({
    client_id: 'configured-in-vault',
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
  });

  return new Promise((resolve, reject) => {
    const req = httpsRequest({
      hostname: 'oauth2.googleapis.com',
      path: '/token',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      timeout: 10000,
    }, (res) => {
      let data = '';
      res.on('data', (chunk: Buffer) => { data += chunk.toString(); });
      res.on('end', () => resolve({ status: res.statusCode ?? 500, body: data }));
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Google OAuth timeout')); });
    req.write(payload);
    req.end();
  });
}

// ── GAQL sanitisation ────────────────────────────────

/** Sanitize GAQL parameter — allow only alphanumeric, underscores, hyphens, dots. */
export function sanitizeGaqlParam(value: string): string {
  return value.replace(/[^a-zA-Z0-9_.\-]/g, '');
}

/** Sanitize a date string for GAQL — must be YYYY-MM-DD. */
export function sanitizeDate(value: string): string {
  const match = value.match(/^(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : new Date().toISOString().slice(0, 10);
}

// ── GAQL response extraction ─────────────────────────

/** Extract the first results array from a searchStream response. */
export function extractSearchStreamRows(body: string): Array<Record<string, unknown>> {
  const parsed = safeParseJson(body);
  const batches = parsed as unknown as Array<{ results?: Array<Record<string, unknown>> }>;
  return batches[0]?.results ?? [];
}

// ── Error classification ─────────────────────────────

export function throwGoogleApiError(status: number, body: string): never {
  const parsed = safeParseJson(body);
  const errMsg = (parsed.error as Record<string, unknown>)?.message as string ?? `HTTP ${status}`;
  if (status === 429) {
    throw makePlatformError('google', 'RATE_LIMITED', status, errMsg, true, 60);
  }
  if (status === 401 || status === 403) {
    throw makePlatformError('google', 'AUTH_EXPIRED', status, errMsg);
  }
  if (errMsg.toLowerCase().includes('budget') || errMsg.includes('BudgetError')) {
    throw makePlatformError('google', 'BUDGET_EXCEEDED', status, errMsg);
  }
  throw makePlatformError('google', 'UNKNOWN', status, errMsg);
}
