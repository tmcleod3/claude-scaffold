/**
 * Tower Rate Limit — Per-IP rate limiting for login and auth endpoints.
 * Extracted from tower-auth.ts (ARCH-R2-003).
 *
 * 5 attempts per 60-second window. Lockout after 10 consecutive failures (30 min).
 */

interface RateLimitEntry {
  attempts: number;
  firstAttempt: number;
  consecutiveFailures: number;
  lockedUntil: number;
}

const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const RATE_LIMIT_MAX = 5;
const LOCKOUT_THRESHOLD = 10;
const LOCKOUT_DURATION_MS = 30 * 60 * 1000;

const rateLimits = new Map<string, RateLimitEntry>();

export function checkRateLimit(ip: string): { allowed: boolean; retryAfterMs: number } {
  // VOIDFORGE_TEST: skip rate limiting so E2E tests aren't throttled
  if (process.env['VOIDFORGE_TEST'] === '1') {
    return { allowed: true, retryAfterMs: 0 };
  }

  const now = Date.now();
  const entry = rateLimits.get(ip);

  if (!entry) {
    rateLimits.set(ip, { attempts: 1, firstAttempt: now, consecutiveFailures: 0, lockedUntil: 0 });
    return { allowed: true, retryAfterMs: 0 };
  }

  if (entry.lockedUntil > now) {
    return { allowed: false, retryAfterMs: entry.lockedUntil - now };
  }

  if (now - entry.firstAttempt > RATE_LIMIT_WINDOW_MS) {
    entry.attempts = 1;
    entry.firstAttempt = now;
    return { allowed: true, retryAfterMs: 0 };
  }

  entry.attempts++;
  if (entry.attempts > RATE_LIMIT_MAX) {
    return { allowed: false, retryAfterMs: RATE_LIMIT_WINDOW_MS - (now - entry.firstAttempt) };
  }

  return { allowed: true, retryAfterMs: 0 };
}

export function recordFailure(ip: string): void {
  const entry = rateLimits.get(ip);
  if (!entry) return;
  entry.consecutiveFailures++;
  if (entry.consecutiveFailures >= LOCKOUT_THRESHOLD) {
    entry.lockedUntil = Date.now() + LOCKOUT_DURATION_MS;
    entry.consecutiveFailures = 0;
  }
}

export function clearFailures(ip: string): void {
  const entry = rateLimits.get(ip);
  if (entry) entry.consecutiveFailures = 0;
}

/** Evict stale rate-limit entries (called by periodic cleanup). */
export function cleanupStaleEntries(): void {
  const now = Date.now();
  for (const [ip, entry] of rateLimits) {
    if (now - entry.firstAttempt > RATE_LIMIT_WINDOW_MS && entry.lockedUntil < now) {
      rateLimits.delete(ip);
    }
  }
}

// getClientIp removed — single source of truth is tower-auth.ts (v17.0 No Stubs cleanup)
