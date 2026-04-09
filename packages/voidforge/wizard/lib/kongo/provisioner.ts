/**
 * Kongo Provisioner — API key setup and connection verification.
 *
 * Called during /cultivation install Step 2b: "Connect Kongo for landing pages?"
 *
 * Kongo uses API keys (ke_live_ prefix), not OAuth. Keys are created in the
 * Kongo dashboard at kongo.io/dashboard/api. The provisioner:
 * 1. Accepts a user-provided API key
 * 2. Verifies the connection with GET /engine/pages (expects 200)
 * 3. Stores the key in the financial vault
 * 4. Stores the webhook signing secret (optional)
 *
 * PRD Reference: PRD-kongo-integration.md §4.4 (adjusted from OAuth to manual)
 */

import { KongoClient, KongoApiError } from './client.js';
import type { PaginatedResponse, PageDetail } from './types.js';

// ── Vault Keys ───────────────────────────────────────────

/** Vault key for the Kongo API key */
export const KONGO_API_KEY_VAULT_KEY = 'kongo-api-key';

/** Vault key for the webhook signing secret */
export const KONGO_WEBHOOK_SECRET_VAULT_KEY = 'kongo-webhook-secret';

// ── Connection Verification ──────────────────────────────

export interface KongoConnectionStatus {
  readonly connected: boolean;
  readonly pageCount?: number;
  readonly error?: string;
}

/**
 * Verify a Kongo API key by making a read-only API call.
 * Returns connection status with page count on success.
 */
export async function verifyKongoConnection(apiKey: string): Promise<KongoConnectionStatus> {
  try {
    const client = new KongoClient({ apiKey });
    const result = await client.get<PaginatedResponse<PageDetail>>('/engine/pages', { limit: 1 });

    return {
      connected: true,
      pageCount: result.items.length > 0 ? undefined : 0, // Can't know total from first page
    };
  } catch (err) {
    if (err instanceof KongoApiError) {
      return {
        connected: false,
        error: `${err.code}: ${err.message}`,
      };
    }
    return {
      connected: false,
      error: err instanceof Error ? err.message : 'Unknown error',
    };
  }
}

// ── Provisioning ─────────────────────────────────────────

export interface KongoProvisionConfig {
  readonly apiKey: string;
  readonly webhookSecret?: string;
}

export interface KongoProvisionResult {
  readonly success: boolean;
  readonly message: string;
  readonly connection?: KongoConnectionStatus;
}

/**
 * Provision Kongo access during /cultivation install.
 *
 * Steps:
 * 1. Validate key format (ke_live_ prefix)
 * 2. Verify connection with read-only API call
 * 3. Store key in financial vault
 * 4. Optionally store webhook signing secret
 *
 * @param config - API key and optional webhook secret
 * @param vaultSet - Financial vault setter (injected for testability)
 */
export async function provisionKongo(
  config: KongoProvisionConfig,
  vaultSet: (key: string, value: string) => Promise<void>,
): Promise<KongoProvisionResult> {
  // Validate key format
  if (!config.apiKey.startsWith('ke_live_')) {
    return {
      success: false,
      message: 'Invalid API key format. Kongo keys use the ke_live_ prefix. Get yours at kongo.io/dashboard/api',
    };
  }

  // Verify connection
  const connection = await verifyKongoConnection(config.apiKey);
  if (!connection.connected) {
    return {
      success: false,
      message: `Kongo connection failed: ${connection.error}`,
      connection,
    };
  }

  // Store in vault
  await vaultSet(KONGO_API_KEY_VAULT_KEY, config.apiKey);

  if (config.webhookSecret) {
    await vaultSet(KONGO_WEBHOOK_SECRET_VAULT_KEY, config.webhookSecret);
  }

  return {
    success: true,
    message: 'Kongo connected successfully.',
    connection,
  };
}

// ── Connection Check ─────────────────────────────────────

/**
 * Check if Kongo is connected (API key exists in vault).
 */
export async function isKongoConnected(
  vaultGet: (key: string) => Promise<string | null>,
): Promise<boolean> {
  const apiKey = await vaultGet(KONGO_API_KEY_VAULT_KEY);
  return apiKey !== null && apiKey.startsWith('ke_live_');
}

/**
 * Create a KongoClient from vault credentials.
 * Returns null if Kongo is not connected.
 */
export async function getKongoClient(
  vaultGet: (key: string) => Promise<string | null>,
): Promise<KongoClient | null> {
  const apiKey = await vaultGet(KONGO_API_KEY_VAULT_KEY);
  if (!apiKey) return null;

  try {
    return new KongoClient({ apiKey });
  } catch {
    return null;
  }
}

/**
 * Remove Kongo credentials from vault (disconnect).
 */
export async function disconnectKongo(
  vaultDelete: (key: string) => Promise<void>,
): Promise<void> {
  await vaultDelete(KONGO_API_KEY_VAULT_KEY);
  await vaultDelete(KONGO_WEBHOOK_SECRET_VAULT_KEY);
}
