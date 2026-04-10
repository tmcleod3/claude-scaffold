/**
 * Adapter types tests — verifies re-exports from ad-platform-core and rate-limiter-core.
 * These are type re-exports + value re-exports (toCents, toDollars, OutboundRateLimiter, getLimiter).
 */

import { describe, it, expect } from 'vitest';
import { toCents, toDollars, OutboundRateLimiter, getLimiter } from '../lib/adapters/types.js';

describe('toCents / toDollars', () => {
  it('toCents converts dollars to cents', () => {
    expect(toCents(10)).toBe(1000);
    expect(toCents(0.01)).toBe(1);
    expect(toCents(0)).toBe(0);
  });

  it('toDollars converts cents to dollars', () => {
    expect(toDollars(1000)).toBe(10);
    expect(toDollars(1)).toBe(0.01);
    expect(toDollars(0)).toBe(0);
  });
});

describe('OutboundRateLimiter', () => {
  it('is a constructable class', () => {
    expect(typeof OutboundRateLimiter).toBe('function');
  });
});

describe('getLimiter', () => {
  it('is an exported function', () => {
    expect(typeof getLimiter).toBe('function');
  });
});
