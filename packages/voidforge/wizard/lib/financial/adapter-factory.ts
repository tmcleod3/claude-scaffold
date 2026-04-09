/**
 * Adapter Factory — config-driven adapter instantiation.
 *
 * Reads funding-config from the financial vault and returns the correct
 * adapter (real or sandbox) based on what the user configured during
 * the interactive setup wizard.
 *
 * This eliminates the hard-coded SandboxStablecoinAdapter in the daemon.
 * Each factory function:
 *   1. If vaultKey is null → sandbox adapter (no vault access)
 *   2. Reads funding-config from vault → determines provider
 *   3. Reads provider API key from vault → instantiates real adapter
 *   4. If API key missing → logs warning, falls back to sandbox
 *
 * PRD Reference: §12.1, §12.2, §12.3
 * No Stubs Doctrine: every code path returns a working adapter instance.
 */

import { financialVaultGet } from '../financial-vault.js';
import { SandboxStablecoinAdapter } from './stablecoin/sandbox-stablecoin.js';
import { SandboxBankAdapter } from '../adapters/sandbox-bank.js';

import type { StablecoinAdapter } from './stablecoin/base.js';
import type { RevenueSourceAdapter } from '../revenue-types.js';
import type { AdBillingAdapter, AdPlatform } from './billing/base.js';
import type { AdPlatformAdapter } from './campaign/base.js';
import { SandboxCampaignAdapter } from './campaign/sandbox-campaign.js';

// ── Internal Types ───────────────────────────────────

interface FundingConfig {
  stablecoinProvider?: 'circle' | 'sandbox';
  bankProvider?: 'mercury' | 'sandbox';
  circleBankId?: string;
  mercuryAccountId?: string;
}

/** Minimal logger — matches the daemon Logger interface. */
interface FactoryLogger {
  log(message: string): void;
}

const noopLogger: FactoryLogger = { log() {} };

// ── Config Reader ────────────────────────────────────

async function readFundingConfig(
  vaultKey: string,
): Promise<FundingConfig | null> {
  const raw = await financialVaultGet(vaultKey, 'funding-config');
  if (!raw) return null;
  try {
    return JSON.parse(raw) as FundingConfig;
  } catch {
    return null;
  }
}

// ── Stablecoin Adapter Factory ───────────────────────

/**
 * Returns a StablecoinAdapter: CircleAdapter if configured with credentials,
 * otherwise SandboxStablecoinAdapter.
 */
export async function getStablecoinAdapter(
  vaultKey: string | null,
  logger: FactoryLogger = noopLogger,
): Promise<StablecoinAdapter> {
  if (!vaultKey) {
    logger.log('Adapter factory: no vault key — using sandbox stablecoin adapter');
    return new SandboxStablecoinAdapter();
  }

  try {
    const config = await readFundingConfig(vaultKey);
    if (!config || config.stablecoinProvider === 'sandbox') {
      logger.log('Adapter factory: funding config specifies sandbox stablecoin');
      return new SandboxStablecoinAdapter();
    }

    if (config.stablecoinProvider === 'circle') {
      const apiKey = await financialVaultGet(vaultKey, 'circle-api-key');
      if (!apiKey) {
        logger.log('Adapter factory: circle-api-key not found in vault — falling back to sandbox');
        return new SandboxStablecoinAdapter();
      }
      const bankId = config.circleBankId ?? '';
      if (!bankId) {
        logger.log('Adapter factory: circleBankId missing in funding config — falling back to sandbox');
        return new SandboxStablecoinAdapter();
      }

      const { CircleAdapter } = await import('./stablecoin/circle.js');
      logger.log('Adapter factory: using Circle stablecoin adapter');
      return new CircleAdapter({ apiKey, bankId });
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    logger.log(`Adapter factory: stablecoin adapter creation failed (${msg}) — falling back to sandbox`);
  }

  return new SandboxStablecoinAdapter();
}

// ── Bank Adapter Factory ─────────────────────────────

/**
 * Returns a RevenueSourceAdapter for bank operations: MercuryBankAdapter
 * if configured with credentials, otherwise SandboxBankAdapter.
 */
export async function getBankAdapter(
  vaultKey: string | null,
  logger: FactoryLogger = noopLogger,
): Promise<RevenueSourceAdapter> {
  if (!vaultKey) {
    logger.log('Adapter factory: no vault key — using sandbox bank adapter');
    return new SandboxBankAdapter('Sandbox Bank');
  }

  try {
    const config = await readFundingConfig(vaultKey);
    if (!config || config.bankProvider === 'sandbox') {
      logger.log('Adapter factory: funding config specifies sandbox bank');
      return new SandboxBankAdapter('Sandbox Bank');
    }

    if (config.bankProvider === 'mercury') {
      const apiKey = await financialVaultGet(vaultKey, 'mercury-api-key');
      if (!apiKey) {
        logger.log('Adapter factory: mercury-api-key not found in vault — falling back to sandbox');
        return new SandboxBankAdapter('Sandbox Bank');
      }

      const { MercuryBankAdapter } = await import('./stablecoin/mercury.js');
      logger.log('Adapter factory: using Mercury bank adapter');
      return new MercuryBankAdapter(apiKey, config.mercuryAccountId);
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    logger.log(`Adapter factory: bank adapter creation failed (${msg}) — falling back to sandbox`);
  }

  return new SandboxBankAdapter('Sandbox Bank');
}

// ── Billing Adapter Factory ──────────────────────────

/**
 * Returns an AdBillingAdapter for the given platform, or null if not configured.
 * Platform credentials are read from the financial vault.
 */
export async function getBillingAdapter(
  platform: AdPlatform,
  vaultKey: string | null,
  logger: FactoryLogger = noopLogger,
): Promise<AdBillingAdapter | null> {
  if (!vaultKey) {
    logger.log(`Adapter factory: no vault key — no ${platform} billing adapter`);
    return null;
  }

  try {
    if (platform === 'google') {
      const accessToken = await financialVaultGet(vaultKey, 'google-ads-token');
      const developerToken = await financialVaultGet(vaultKey, 'google-developer-token');
      const customerId = await financialVaultGet(vaultKey, 'google-customer-id');
      if (!accessToken || !developerToken || !customerId) {
        logger.log('Adapter factory: Google Ads credentials incomplete — billing adapter unavailable');
        return null;
      }

      const { GoogleBillingAdapter } = await import('./billing/google-billing.js');
      logger.log('Adapter factory: using Google billing adapter');
      return new GoogleBillingAdapter({ customerId, accessToken, developerToken });
    }

    if (platform === 'meta') {
      const accessToken = await financialVaultGet(vaultKey, 'meta-access-token');
      const adAccountId = await financialVaultGet(vaultKey, 'meta-ad-account-id');
      if (!accessToken || !adAccountId) {
        logger.log('Adapter factory: Meta Ads credentials incomplete — billing adapter unavailable');
        return null;
      }

      const { MetaBillingAdapter } = await import('./billing/meta-billing.js');
      logger.log('Adapter factory: using Meta billing adapter');
      return new MetaBillingAdapter({ adAccountId, accessToken });
    }

    if (platform === 'tiktok') {
      const accessToken = await financialVaultGet(vaultKey, 'tiktok-access-token');
      const appId = await financialVaultGet(vaultKey, 'tiktok-app-id');
      if (!accessToken || !appId) {
        logger.log('Adapter factory: TikTok Ads credentials incomplete — billing adapter unavailable');
        return null;
      }

      const { TikTokBillingAdapter } = await import('./billing/tiktok-billing.js');
      logger.log('Adapter factory: using TikTok billing adapter');
      return new TikTokBillingAdapter({ appId, accessToken });
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    logger.log(`Adapter factory: ${platform} billing adapter creation failed (${msg})`);
  }

  return null;
}

// ── Campaign Adapter Factory ────────────────────────

/**
 * Cached sandbox campaign adapters — one per platform.
 * The sandbox adapter stores campaigns in memory; creating a new instance
 * per call loses all campaign state between operations.
 */
const sandboxCampaignAdapters = new Map<string, AdPlatformAdapter>();

function getSandboxCampaignAdapter(platform: AdPlatform): AdPlatformAdapter {
  let adapter = sandboxCampaignAdapters.get(platform);
  if (!adapter) {
    adapter = new SandboxCampaignAdapter(platform);
    sandboxCampaignAdapters.set(platform, adapter);
  }
  return adapter;
}

/**
 * Returns an AdPlatformAdapter for campaign CRUD on the given platform.
 * If credentials are missing or platform is unrecognized, returns a cached
 * SandboxCampaignAdapter (one per platform, so campaign state persists).
 */
export async function getCampaignAdapter(
  platform: AdPlatform,
  vaultKey: string | null,
  logger: FactoryLogger = noopLogger,
): Promise<AdPlatformAdapter> {
  if (!vaultKey) {
    logger.log(`Adapter factory: no vault key — using sandbox campaign adapter for ${platform}`);
    return getSandboxCampaignAdapter(platform);
  }

  try {
    if (platform === 'google') {
      const accessToken = await financialVaultGet(vaultKey, 'google-ads-token');
      const developerToken = await financialVaultGet(vaultKey, 'google-developer-token');
      const customerId = await financialVaultGet(vaultKey, 'google-customer-id');
      if (!accessToken || !developerToken || !customerId) {
        logger.log('Adapter factory: Google Ads credentials incomplete — falling back to sandbox campaign adapter');
        return getSandboxCampaignAdapter(platform);
      }

      const { GoogleCampaignAdapter } = await import('./campaign/google-campaign.js');
      logger.log('Adapter factory: using Google campaign adapter');
      return new GoogleCampaignAdapter({ customerId, accessToken, developerToken });
    }

    if (platform === 'meta') {
      const accessToken = await financialVaultGet(vaultKey, 'meta-access-token');
      const adAccountId = await financialVaultGet(vaultKey, 'meta-ad-account-id');
      if (!accessToken || !adAccountId) {
        logger.log('Adapter factory: Meta Ads credentials incomplete — falling back to sandbox campaign adapter');
        return getSandboxCampaignAdapter(platform);
      }

      const { MetaCampaignAdapter } = await import('./campaign/meta-campaign.js');
      logger.log('Adapter factory: using Meta campaign adapter');
      return new MetaCampaignAdapter({ adAccountId, accessToken });
    }

    if (platform === 'tiktok') {
      const accessToken = await financialVaultGet(vaultKey, 'tiktok-access-token');
      const appId = await financialVaultGet(vaultKey, 'tiktok-app-id');
      if (!accessToken || !appId) {
        logger.log('Adapter factory: TikTok credentials incomplete — falling back to sandbox campaign adapter');
        return getSandboxCampaignAdapter(platform);
      }

      const { TikTokCampaignAdapter } = await import('./campaign/tiktok-campaign.js');
      logger.log('Adapter factory: using TikTok campaign adapter');
      return new TikTokCampaignAdapter({ appId, accessToken });
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    logger.log(`Adapter factory: ${platform} campaign adapter creation failed (${msg}) — falling back to sandbox`);
  }

  logger.log(`Adapter factory: unrecognized platform '${platform}' — using sandbox campaign adapter`);
  return getSandboxCampaignAdapter(platform);
}
