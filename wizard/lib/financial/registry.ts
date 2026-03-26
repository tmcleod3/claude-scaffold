/**
 * Financial provider and billing adapter registries.
 *
 * Tracks which stablecoin providers and ad billing adapters are implemented.
 * New providers are added here first (implemented: false) then built out.
 */

interface ProviderEntry {
  readonly name: string;
  readonly implemented: boolean;
}

export const STABLECOIN_PROVIDERS: Record<string, ProviderEntry> = {
  sandbox: { name: 'Sandbox (Demo)', implemented: true },
  circle:  { name: 'Circle', implemented: false },
  bridge:  { name: 'Bridge', implemented: false },
} as const;

export const BILLING_ADAPTERS: Record<string, ProviderEntry> = {
  google: { name: 'Google Ads Billing', implemented: false },
  meta:   { name: 'Meta Ads Billing', implemented: false },
} as const;

export type StablecoinProviderId = keyof typeof STABLECOIN_PROVIDERS;
export type BillingAdapterId = keyof typeof BILLING_ADAPTERS;
