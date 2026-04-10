/**
 * Adapter barrel export tests — verifies all expected exports are present
 * and the platform registry has correct structure.
 */

import { describe, it, expect } from 'vitest';
import {
  SandboxSetup,
  SandboxAdapter,
  SandboxBankAdapter,
  StripeAdapter,
  PLATFORM_REGISTRY,
  REVENUE_ADAPTERS,
} from '../lib/adapters/index.js';

describe('adapter barrel exports', () => {
  it('exports SandboxSetup class', () => {
    expect(SandboxSetup).toBeDefined();
    expect(typeof SandboxSetup).toBe('function');
  });

  it('exports SandboxAdapter class', () => {
    expect(SandboxAdapter).toBeDefined();
    expect(typeof SandboxAdapter).toBe('function');
  });

  it('exports SandboxBankAdapter class', () => {
    expect(SandboxBankAdapter).toBeDefined();
    expect(typeof SandboxBankAdapter).toBe('function');
  });

  it('exports StripeAdapter class', () => {
    expect(StripeAdapter).toBeDefined();
    expect(typeof StripeAdapter).toBe('function');
  });
});

describe('PLATFORM_REGISTRY', () => {
  it('contains sandbox as implemented', () => {
    expect(PLATFORM_REGISTRY.sandbox.implemented).toBe(true);
    expect(PLATFORM_REGISTRY.sandbox.sandbox).toBe(true);
  });

  it('contains all major ad platforms', () => {
    const platforms = Object.keys(PLATFORM_REGISTRY);
    expect(platforms).toContain('meta');
    expect(platforms).toContain('google');
    expect(platforms).toContain('tiktok');
    expect(platforms).toContain('linkedin');
    expect(platforms).toContain('twitter');
    expect(platforms).toContain('reddit');
  });

  it('all entries have required fields', () => {
    for (const [key, info] of Object.entries(PLATFORM_REGISTRY)) {
      expect(info.name).toBeTruthy();
      expect(typeof info.minBudgetCents).toBe('number');
      expect(typeof info.implemented).toBe('boolean');
    }
  });
});

describe('REVENUE_ADAPTERS', () => {
  it('has sandbox and stripe as implemented', () => {
    expect(REVENUE_ADAPTERS.sandbox.implemented).toBe(true);
    expect(REVENUE_ADAPTERS.stripe.implemented).toBe(true);
  });

  it('has paddle, mercury, brex as not implemented', () => {
    expect(REVENUE_ADAPTERS.paddle.implemented).toBe(false);
    expect(REVENUE_ADAPTERS.mercury.implemented).toBe(false);
    expect(REVENUE_ADAPTERS.brex.implemented).toBe(false);
  });
});
