/**
 * KongoClient — Authenticated HTTP client for the Kongo Engine API.
 *
 * First-party integration (ADR-036): Kongo is owned by the same user.
 * No adapter abstraction — direct typed client.
 *
 * Credentials: API key (ke_live_ prefix) stored in financial vault.
 * Rate limiting: 60 requests/minute sliding window (client-side safety).
 * Retries: Exponential backoff on 429, 3 attempts max.
 * No external dependencies: uses node:https only.
 *
 * PRD Reference: PRD-kongo-integration.md §4.1, §8
 */

import { request as httpsRequest } from 'node:https';
import { URL } from 'node:url';

import type {
  KongoClientConfig,
  KongoResponse,
  KongoErrorCode,
} from './types.js';

// ── KongoApiError ────────────────────────────────────────

export class KongoApiError extends Error {
  readonly code: KongoErrorCode | string;
  readonly status: number;
  readonly retryable: boolean;
  readonly retryAfterMs?: number;

  constructor(
    code: KongoErrorCode | string,
    message: string,
    status: number,
    retryable = false,
    retryAfterMs?: number,
  ) {
    super(message);
    this.name = 'KongoApiError';
    this.code = code;
    this.status = status;
    this.retryable = retryable;
    this.retryAfterMs = retryAfterMs;
  }
}

// ── Sliding Window Rate Limiter ──────────────────────────

export class SlidingWindowLimiter {
  private readonly timestamps: number[] = [];
  private readonly windowMs: number;
  private readonly maxRequests: number;

  constructor(maxRequestsPerMinute: number) {
    this.windowMs = 60_000;
    this.maxRequests = maxRequestsPerMinute;
  }

  acquire(): void {
    const now = Date.now();
    // Evict timestamps outside the window
    while (this.timestamps.length > 0 && this.timestamps[0] <= now - this.windowMs) {
      this.timestamps.shift();
    }
    if (this.timestamps.length >= this.maxRequests) {
      const waitMs = this.timestamps[0] + this.windowMs - now;
      throw new KongoApiError(
        'RATE_LIMITED',
        `Client-side rate limit exceeded. Retry in ${Math.ceil(waitMs / 1000)}s.`,
        429,
        true,
        waitMs,
      );
    }
    this.timestamps.push(now);
  }

  getStatus(): { available: number; total: number; windowMs: number } {
    const now = Date.now();
    while (this.timestamps.length > 0 && this.timestamps[0] <= now - this.windowMs) {
      this.timestamps.shift();
    }
    return {
      available: this.maxRequests - this.timestamps.length,
      total: this.maxRequests,
      windowMs: this.windowMs,
    };
  }
}

// ── KongoClient ──────────────────────────────────────────

const DEFAULT_BASE_URL = 'https://kongo.io/api/v1';
const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_RATE_LIMIT = 60;
const MAX_RETRIES = 3;
const BACKOFF_BASE_MS = 1_000;

export class KongoClient {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly limiter: SlidingWindowLimiter;

  constructor(config: KongoClientConfig) {
    if (!config.apiKey || !config.apiKey.startsWith('ke_live_')) {
      throw new KongoApiError(
        'UNAUTHORIZED',
        'Invalid API key format. Kongo keys use the ke_live_ prefix.',
        401,
      );
    }
    this.apiKey = config.apiKey;
    this.baseUrl = config.baseUrl ?? DEFAULT_BASE_URL;
    this.timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.limiter = new SlidingWindowLimiter(config.rateLimitPerMinute ?? DEFAULT_RATE_LIMIT);
  }

  /** GET request */
  async get<T>(path: string, query?: Record<string, string | number | boolean | undefined>): Promise<T> {
    return this.requestWithRetry<T>('GET', path, undefined, query);
  }

  /** POST request */
  async post<T>(path: string, body?: unknown, headers?: Record<string, string>): Promise<T> {
    return this.requestWithRetry<T>('POST', path, body, undefined, headers);
  }

  /** PUT request */
  async put<T>(path: string, body?: unknown): Promise<T> {
    return this.requestWithRetry<T>('PUT', path, body);
  }

  /** PATCH request */
  async patch<T>(path: string, body?: unknown): Promise<T> {
    return this.requestWithRetry<T>('PATCH', path, body);
  }

  /** DELETE request */
  async delete<T>(path: string): Promise<T> {
    return this.requestWithRetry<T>('DELETE', path);
  }

  /** Rate limiter status for monitoring */
  getRateLimitStatus() {
    return this.limiter.getStatus();
  }

  // ── Internal ─────────────────────────────────────────

  private async requestWithRetry<T>(
    method: string,
    path: string,
    body?: unknown,
    query?: Record<string, string | number | boolean | undefined>,
    extraHeaders?: Record<string, string>,
  ): Promise<T> {
    let lastError: KongoApiError | undefined;

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      try {
        this.limiter.acquire();
        return await this.rawRequest<T>(method, path, body, query, extraHeaders);
      } catch (err) {
        if (!(err instanceof KongoApiError)) throw err;
        lastError = err;

        if (!err.retryable || attempt === MAX_RETRIES - 1) throw err;

        const backoffMs = err.retryAfterMs ?? BACKOFF_BASE_MS * Math.pow(2, attempt);
        await sleep(backoffMs);
      }
    }

    throw lastError ?? new KongoApiError('UNKNOWN', 'Request failed', 500);
  }

  private rawRequest<T>(
    method: string,
    path: string,
    body?: unknown,
    query?: Record<string, string | number | boolean | undefined>,
    extraHeaders?: Record<string, string>,
  ): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      // Concatenate base URL path with request path (URL constructor replaces path on leading /)
      const base = this.baseUrl.replace(/\/$/, '');
      const cleanPath = path.startsWith('/') ? path : `/${path}`;
      const url = new URL(`${base}${cleanPath}`);
      if (query) {
        for (const [key, val] of Object.entries(query)) {
          if (val !== undefined) url.searchParams.set(key, String(val));
        }
      }

      const payload = body ? JSON.stringify(body) : undefined;

      const headers: Record<string, string> = {
        'Authorization': `Bearer ${this.apiKey}`,
        'Accept': 'application/json',
        ...extraHeaders,
      };
      if (payload) {
        headers['Content-Type'] = 'application/json';
        headers['Content-Length'] = String(Buffer.byteLength(payload));
      }

      const req = httpsRequest(
        url,
        { method, headers, timeout: this.timeoutMs },
        (res) => {
          const chunks: Buffer[] = [];
          res.on('data', (chunk: Buffer) => chunks.push(chunk));
          res.on('end', () => {
            const raw = Buffer.concat(chunks).toString('utf-8');

            // HTML endpoint returns raw HTML, not JSON
            if (res.headers['content-type']?.includes('text/html')) {
              resolve(raw as unknown as T);
              return;
            }

            let parsed: KongoResponse<T>;
            try {
              parsed = JSON.parse(raw) as KongoResponse<T>;
            } catch {
              reject(new KongoApiError(
                'UNKNOWN',
                `Failed to parse Kongo response: ${raw.slice(0, 200)}`,
                res.statusCode ?? 500,
              ));
              return;
            }

            if (!parsed.success) {
              const status = res.statusCode ?? 500;
              const retryable = status === 429 || status === 503;
              const retryAfterMs = res.headers['retry-after']
                ? parseInt(res.headers['retry-after'] as string, 10) * 1000
                : undefined;

              reject(new KongoApiError(
                parsed.error.code,
                parsed.error.message,
                status,
                retryable,
                retryAfterMs,
              ));
              return;
            }

            resolve(parsed.data);
          });
        },
      );

      req.on('error', (err) => {
        reject(new KongoApiError('NETWORK_ERROR', err.message, 0, true));
      });

      req.on('timeout', () => {
        req.destroy();
        reject(new KongoApiError('TIMEOUT', `Request timed out after ${this.timeoutMs}ms`, 408, true));
      });

      if (payload) req.write(payload);
      req.end();
    });
  }
}

// ── Helpers ──────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
