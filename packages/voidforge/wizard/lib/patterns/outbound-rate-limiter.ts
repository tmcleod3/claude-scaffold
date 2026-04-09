/**
 * Pattern: Outbound Rate Limiter
 *
 * Key principles:
 * - Token bucket per-platform with configurable capacity and refill rate
 * - Safety margin reservation: hold back 10% of capacity for health checks
 * - Queue overflow handling: reject with RATE_LIMITED error, don't block forever
 * - Per-platform configuration (Meta: 200/hr, Google: 15000/day, etc.)
 * - Exponential backoff on 429 responses from platforms
 * - Daily quota tracking for platforms with daily limits (Google, LinkedIn)
 *
 * Agents: Breeze (platform relations), Wax (paid ads)
 *
 * PRD Reference: §9.5 (rate limit strategy), §9.17 (outbound-rate-limiter.ts)
 */

type AdPlatform = 'meta' | 'google' | 'tiktok' | 'linkedin' | 'twitter' | 'reddit';

// ── Per-Platform Rate Limits (from §9.5) ──────────────

interface PlatformRateConfig {
  platform: AdPlatform;
  capacity: number;           // Max tokens in bucket
  refillRate: number;         // Tokens per second
  dailyQuota?: number;        // Daily operation limit (Google, LinkedIn)
  burstAllowed: boolean;      // Can we burst up to capacity?
  safetyMargin: number;       // 0-1, fraction of capacity reserved for health checks
  backoffBase: number;        // Base backoff in ms on 429
  maxRetries: number;         // Max retry attempts
}

const PLATFORM_RATES: Record<AdPlatform, PlatformRateConfig> = {
  meta: {
    platform: 'meta',
    capacity: 200,              // 200 calls/hr/ad account
    refillRate: 200 / 3600,     // ~0.056 tokens/sec
    burstAllowed: true,
    safetyMargin: 0.10,
    backoffBase: 1000,
    maxRetries: 5,
  },
  google: {
    platform: 'google',
    capacity: 100,              // Batch operations — 15000/day but bursty
    refillRate: 15000 / 86400,  // ~0.174 tokens/sec
    dailyQuota: 15000,          // Mutate operations/day
    burstAllowed: true,
    safetyMargin: 0.10,
    backoffBase: 1000,
    maxRetries: 5,
  },
  tiktok: {
    platform: 'tiktok',
    capacity: 10,               // 10 req/sec
    refillRate: 10,             // 10 tokens/sec
    burstAllowed: false,        // Strict per-second
    safetyMargin: 0.10,
    backoffBase: 500,
    maxRetries: 5,
  },
  linkedin: {
    platform: 'linkedin',
    capacity: 100,              // 100 calls/day — very restrictive
    refillRate: 100 / 86400,    // ~0.0012 tokens/sec
    dailyQuota: 100,
    burstAllowed: false,
    safetyMargin: 0.20,         // Higher margin — can't afford waste
    backoffBase: 5000,
    maxRetries: 3,              // Fewer retries — each costs a daily call
  },
  twitter: {
    platform: 'twitter',
    capacity: 450,              // 450 req/15min
    refillRate: 450 / 900,      // 0.5 tokens/sec
    burstAllowed: true,
    safetyMargin: 0.10,
    backoffBase: 1000,
    maxRetries: 5,
  },
  reddit: {
    platform: 'reddit',
    capacity: 60,               // Conservative: 60 req/min (not documented)
    refillRate: 1,              // 1 token/sec
    burstAllowed: false,
    safetyMargin: 0.15,
    backoffBase: 2000,
    maxRetries: 3,
  },
};

// ── Token Bucket Implementation ───────────────────────

class OutboundRateLimiter {
  private tokens: number;
  private lastRefill: number;
  private dailyUsed: number = 0;
  private dailyResetAt: number;
  private readonly config: PlatformRateConfig;
  private readonly effectiveCapacity: number;

  constructor(platform: AdPlatform) {
    this.config = PLATFORM_RATES[platform];
    this.effectiveCapacity = Math.floor(this.config.capacity * (1 - this.config.safetyMargin));
    this.tokens = this.effectiveCapacity;
    this.lastRefill = Date.now();
    this.dailyResetAt = this.nextMidnightUTC();
  }

  /**
   * Acquire a token. Resolves when a token is available.
   * Throws if the daily quota is exhausted.
   */
  async acquire(): Promise<void> {
    this.checkDailyReset();

    // Daily quota check
    if (this.config.dailyQuota && this.dailyUsed >= this.config.dailyQuota) {
      const hoursUntilReset = (this.dailyResetAt - Date.now()) / 3600000;
      throw new RateLimitError(
        this.config.platform,
        `Daily quota exhausted (${this.dailyUsed}/${this.config.dailyQuota}). Resets in ${hoursUntilReset.toFixed(1)} hours.`,
        this.dailyResetAt - Date.now()
      );
    }

    this.refill();

    if (this.tokens >= 1) {
      this.tokens -= 1;
      this.dailyUsed += 1;
      return;
    }

    // Wait for a token
    const waitMs = Math.ceil((1 / this.config.refillRate) * 1000);
    if (waitMs > 30000) {
      // Don't wait more than 30 seconds — reject instead
      throw new RateLimitError(
        this.config.platform,
        'Rate limited — next token available in ' + (waitMs / 1000).toFixed(1) + 's',
        waitMs
      );
    }

    await new Promise(resolve => setTimeout(resolve, waitMs));
    this.refill();
    this.tokens -= 1;
    this.dailyUsed += 1;
  }

  /**
   * Execute a request with automatic retry on 429 responses.
   * Uses exponential backoff with platform-specific base delay.
   */
  async executeWithRetry<T>(fn: () => Promise<T>): Promise<T> {
    let attempt = 0;
    while (attempt < this.config.maxRetries) {
      await this.acquire();
      try {
        return await fn();
      } catch (err) {
        if (isRateLimitResponse(err) && attempt < this.config.maxRetries - 1) {
          const delay = this.config.backoffBase * Math.pow(2, attempt);
          const retryAfter = extractRetryAfter(err);
          const waitMs = retryAfter ? retryAfter * 1000 : delay;
          await new Promise(resolve => setTimeout(resolve, waitMs));
          attempt++;
          continue;
        }
        throw err;
      }
    }
    throw new RateLimitError(this.config.platform, `Max retries (${this.config.maxRetries}) exceeded`, 0);
  }

  /** Get current rate limiter status for monitoring */
  getStatus(): { tokens: number; capacity: number; dailyUsed: number; dailyQuota: number | undefined } {
    this.refill();
    return {
      tokens: Math.floor(this.tokens),
      capacity: this.effectiveCapacity,
      dailyUsed: this.dailyUsed,
      dailyQuota: this.config.dailyQuota,
    };
  }

  /** Reserve N tokens for a batch operation. Returns false if insufficient. */
  canReserve(count: number): boolean {
    this.refill();
    return this.tokens >= count;
  }

  private refill(): void {
    const now = Date.now();
    const elapsed = (now - this.lastRefill) / 1000;
    this.tokens = Math.min(this.effectiveCapacity, this.tokens + elapsed * this.config.refillRate);
    this.lastRefill = now;
  }

  private checkDailyReset(): void {
    if (Date.now() >= this.dailyResetAt) {
      this.dailyUsed = 0;
      this.dailyResetAt = this.nextMidnightUTC();
    }
  }

  private nextMidnightUTC(): number {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() + 1);
    d.setUTCHours(0, 0, 0, 0);
    return d.getTime();
  }
}

// ── Error Types ───────────────────────────────────────

class RateLimitError extends Error {
  readonly platform: string;
  readonly retryAfterMs: number;

  constructor(platform: string, message: string, retryAfterMs: number) {
    super(`[${platform}] Rate limited: ${message}`);
    this.platform = platform;
    this.retryAfterMs = retryAfterMs;
  }
}

function isRateLimitResponse(err: unknown): boolean {
  if (err instanceof RateLimitError) return true;
  // Check for HTTP 429 in various error shapes
  const e = err as Record<string, unknown>;
  if (e.status === 429 || e.statusCode === 429) return true;
  if (typeof e.code === 'string' && e.code === 'RATE_LIMITED') return true;
  return false;
}

function extractRetryAfter(err: unknown): number | null {
  const e = err as Record<string, unknown>;
  if (typeof e.retryAfter === 'number') return e.retryAfter;
  if (e.headers && typeof (e.headers as Record<string, string>)['retry-after'] === 'string') {
    return parseInt((e.headers as Record<string, string>)['retry-after']);
  }
  return null;
}

// ── Limiter Registry ──────────────────────────────────

const limiters = new Map<AdPlatform, OutboundRateLimiter>();

function getLimiter(platform: AdPlatform): OutboundRateLimiter {
  let limiter = limiters.get(platform);
  if (!limiter) {
    limiter = new OutboundRateLimiter(platform);
    limiters.set(platform, limiter);
  }
  return limiter;
}

export { OutboundRateLimiter, RateLimitError, PLATFORM_RATES, getLimiter, isRateLimitResponse };
export type { PlatformRateConfig };
