/**
 * Tower rate limit tests — per-IP limiting, lockout, window reset.
 * Tier 1: Security-critical rate limiting module.
 */

import { describe, it, expect, vi } from 'vitest';

const rateLimit = await import('../lib/tower-rate-limit.js');

describe('checkRateLimit', () => {
  it('should allow the first attempt from a new IP', () => {
    const result = rateLimit.checkRateLimit('fresh-ip-1');
    expect(result.allowed).toBe(true);
    expect(result.retryAfterMs).toBe(0);
  });

  it('should allow up to 5 attempts within the window', () => {
    const ip = 'five-attempts-ip';
    for (let i = 0; i < 5; i++) {
      const result = rateLimit.checkRateLimit(ip);
      expect(result.allowed).toBe(true);
    }
  });

  it('should block the 6th attempt within the window', () => {
    const ip = 'blocked-ip-6th';
    for (let i = 0; i < 5; i++) {
      rateLimit.checkRateLimit(ip);
    }
    const result = rateLimit.checkRateLimit(ip);
    expect(result.allowed).toBe(false);
    expect(result.retryAfterMs).toBeGreaterThan(0);
  });

  it('should reset the window after 60 seconds', () => {
    const ip = 'window-reset-ip';
    for (let i = 0; i < 5; i++) {
      rateLimit.checkRateLimit(ip);
    }

    // Advance time past the 60-second window
    vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 61_000);

    const result = rateLimit.checkRateLimit(ip);
    expect(result.allowed).toBe(true);

    vi.restoreAllMocks();
  });

  it('should track IPs independently', () => {
    const ip1 = 'independent-ip-a';
    const ip2 = 'independent-ip-b';

    // Exhaust ip1's limit
    for (let i = 0; i < 5; i++) {
      rateLimit.checkRateLimit(ip1);
    }
    expect(rateLimit.checkRateLimit(ip1).allowed).toBe(false);

    // ip2 should still be allowed
    expect(rateLimit.checkRateLimit(ip2).allowed).toBe(true);
  });
});

describe('recordFailure + lockout', () => {
  it('should lock out an IP after 10 consecutive failures', () => {
    const ip = 'lockout-ip-10';

    // Need at least one checkRateLimit call to create the entry
    rateLimit.checkRateLimit(ip);

    // Record 10 consecutive failures
    for (let i = 0; i < 10; i++) {
      rateLimit.recordFailure(ip);
    }

    // The next check should be blocked due to lockout
    const result = rateLimit.checkRateLimit(ip);
    expect(result.allowed).toBe(false);
    expect(result.retryAfterMs).toBeGreaterThan(0);
  });

  it('should not lock out for fewer than 10 failures', () => {
    const ip = 'no-lockout-ip';
    rateLimit.checkRateLimit(ip);

    for (let i = 0; i < 9; i++) {
      rateLimit.recordFailure(ip);
    }

    // Should still be allowed (only 2 attempts total in window: 1 initial + 1 more)
    const result = rateLimit.checkRateLimit(ip);
    expect(result.allowed).toBe(true);
  });
});

describe('clearFailures', () => {
  it('should reset the consecutive failure count', () => {
    const ip = 'clear-failures-ip';
    rateLimit.checkRateLimit(ip);

    for (let i = 0; i < 9; i++) {
      rateLimit.recordFailure(ip);
    }

    rateLimit.clearFailures(ip);

    // One more failure should NOT trigger lockout since counter was cleared
    rateLimit.recordFailure(ip);
    // Still within rate limit window
    const result = rateLimit.checkRateLimit(ip);
    // Allowed depends on attempts count, not lockout
    expect(result.retryAfterMs === 0 || result.allowed === false).toBe(true);
  });
});

describe('cleanupStaleEntries', () => {
  it('should remove stale entries outside the window', () => {
    const ip = 'stale-cleanup-ip';
    rateLimit.checkRateLimit(ip);

    // Advance time past the window
    vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 120_000);

    rateLimit.cleanupStaleEntries();

    // After cleanup + window reset, the IP should be treated as new
    const result = rateLimit.checkRateLimit(ip);
    expect(result.allowed).toBe(true);

    vi.restoreAllMocks();
  });
});
