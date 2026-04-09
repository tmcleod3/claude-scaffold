/**
 * Ad Platform Adapter Registry
 *
 * v17.0 No Stubs Doctrine: only fully-implemented adapters are exported.
 * Stub files (meta, google, tiktok, linkedin, twitter, reddit, mercury, brex)
 * were deleted — they contained 77 `throw new Error('Implement...')` calls.
 * These adapters will be implemented when developer accounts are available (v17.1+).
 * See ROADMAP.md for the planned adapter list.
 *
 * Available adapters:
 * - SandboxSetup/SandboxAdapter — full implementation with realistic fake data
 * - SandboxBankAdapter — full implementation for bank/revenue demo
 * - StripeAdapter — real Stripe API via node:https (free test mode)
 *
 * PRD Reference: §9.5, §9.19.10, §9.20.4, §8.1 (Implementation Completeness Policy)
 */

export { SandboxSetup, SandboxAdapter } from './sandbox.js';
export { SandboxBankAdapter } from './sandbox-bank.js';
export { StripeAdapter } from './stripe.js';

export type { AdPlatform } from './types.js';

import type { AdPlatform } from './types.js';

type PlatformInfo = {
  name: string;
  minBudgetCents: number;
  sandbox?: boolean;
  implemented: boolean;
};

/** Platform registry — tracks both available and planned adapters. */
export const PLATFORM_REGISTRY: Record<AdPlatform | 'sandbox', PlatformInfo> = {
  sandbox:  { name: 'Sandbox (Demo)', minBudgetCents: 0, sandbox: true, implemented: true },
  meta:     { name: 'Meta (Facebook/Instagram)', minBudgetCents: 100, implemented: false },
  google:   { name: 'Google Ads', minBudgetCents: 100, implemented: false },
  tiktok:   { name: 'TikTok', minBudgetCents: 2000, implemented: false },
  linkedin: { name: 'LinkedIn', minBudgetCents: 1000, implemented: false },
  twitter:  { name: 'Twitter/X', minBudgetCents: 100, implemented: false },
  reddit:   { name: 'Reddit', minBudgetCents: 500, implemented: false },
};

/** Revenue adapters — only those with real implementations. */
export const REVENUE_ADAPTERS = {
  sandbox: { name: 'Sandbox Bank (Demo)', implemented: true },
  stripe:  { name: 'Stripe', implemented: true },
  paddle:  { name: 'Paddle', implemented: false },
  mercury: { name: 'Mercury', implemented: false },
  brex:    { name: 'Brex', implemented: false },
} as const;
