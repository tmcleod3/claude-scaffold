/**
 * Financial provider and billing adapter registries.
 *
 * Tracks which stablecoin providers, bank adapters, and ad billing adapters
 * are implemented. New providers are added here first (implemented: false)
 * then built out.
 */

interface ProviderEntry {
  readonly name: string;
  readonly implemented: boolean;
}

export const STABLECOIN_PROVIDERS: Record<string, ProviderEntry> = {
  sandbox: { name: 'Sandbox (Demo)', implemented: true },
  circle:  { name: 'Circle', implemented: true },
  bridge:  { name: 'Bridge', implemented: false },
} as const;

export const BANK_ADAPTERS: Record<string, ProviderEntry> = {
  mercury: { name: 'Mercury', implemented: true },
} as const;

export const BILLING_ADAPTERS: Record<string, ProviderEntry> = {
  google: { name: 'Google Ads Billing', implemented: true },
  meta:   { name: 'Meta Ads Billing', implemented: true },
  tiktok: { name: 'TikTok Ads Billing', implemented: true },
} as const;

export type StablecoinProviderId = keyof typeof STABLECOIN_PROVIDERS;
export type BankAdapterId = keyof typeof BANK_ADAPTERS;
export type BillingAdapterId = keyof typeof BILLING_ADAPTERS;

// ── Re-exports for convenience ───────────────────────

export { CircleSetup, CircleAdapter } from './stablecoin/circle.js';
export { MercuryBankAdapter } from './stablecoin/mercury.js';
export { GoogleBillingSetup, GoogleBillingAdapter } from './billing/google-billing.js';
export { MetaBillingSetup, MetaBillingAdapter } from './billing/meta-billing.js';
export { TikTokBillingSetup, TikTokBillingAdapter } from './billing/tiktok-billing.js';
