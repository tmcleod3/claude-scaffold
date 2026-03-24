/**
 * Ad Platform Adapter Registry
 *
 * Each platform has two classes: Setup (interactive OAuth) and Adapter (runtime).
 * The daemon uses Adapter instances. The CLI/Danger Room uses Setup for initial connection.
 *
 * PRD Reference: §9.5, §9.19.10, §9.20.4
 */

export { MetaSetup, MetaAdapter } from './meta.js';
export { GoogleSetup, GoogleAdapter } from './google.js';
export { TikTokSetup, TikTokAdapter } from './tiktok.js';
export { LinkedInSetup, LinkedInAdapter } from './linkedin.js';
export { TwitterSetup, TwitterAdapter } from './twitter.js';
export { RedditSetup, RedditAdapter } from './reddit.js';
export { SandboxSetup, SandboxAdapter } from './sandbox.js';
export { SandboxBankAdapter } from './sandbox-bank.js';

export type { AdPlatform } from './types.js';

import type { AdPlatform } from './types.js';

type PlatformInfo = { name: string; minBudgetCents: number; sandbox?: boolean };

/** Map platform names to their Setup + Adapter constructors */
export const PLATFORM_REGISTRY: Record<AdPlatform | 'sandbox', PlatformInfo> = {
  sandbox:  { name: 'Sandbox (Demo)', minBudgetCents: 0, sandbox: true },
  meta:     { name: 'Meta (Facebook/Instagram)', minBudgetCents: 100 },
  google:   { name: 'Google Ads', minBudgetCents: 100 },
  tiktok:   { name: 'TikTok', minBudgetCents: 2000 },
  linkedin: { name: 'LinkedIn', minBudgetCents: 1000 },
  twitter:  { name: 'Twitter/X', minBudgetCents: 100 },
  reddit:   { name: 'Reddit', minBudgetCents: 500 },
};
