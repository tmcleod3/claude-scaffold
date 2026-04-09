/**
 * Pattern: OAuth Token Lifecycle
 *
 * Key principles:
 * - Refresh at 80% of TTL (not at expiry — prevents race conditions)
 * - Multi-grant-type support (authorization_code, refresh_token)
 * - Vault integration — tokens encrypted at rest in financial vault
 * - Failure escalation: retry 3x → pause platform → alert → requires_reauth
 * - Token stored as encrypted blob in vault, keyed by platform name
 * - Session token (daemon) rotates every 24 hours (§9.19.15)
 *
 * Agents: Breeze (platform relations), Dockson (vault)
 *
 * PRD Reference: §9.5 (token refresh strategy), §9.18 (vault session), §9.19.15
 */

type AdPlatform = 'meta' | 'google' | 'tiktok' | 'linkedin' | 'twitter' | 'reddit';

// ── Token Types ───────────────────────────────────────

interface OAuthTokenSet {
  platform: AdPlatform;
  accessToken: string;
  refreshToken: string;
  expiresAt: string;        // ISO 8601
  tokenType: string;        // 'Bearer'
  scopes: string[];
  grantedAt: string;        // ISO 8601 — when the token was first obtained
  lastRefreshedAt: string;  // ISO 8601 — when the token was last refreshed
}

type TokenHealth = 'healthy' | 'expiring_soon' | 'expired' | 'refresh_failed' | 'requires_reauth' | 'revoked';

interface TokenStatus {
  platform: AdPlatform;
  health: TokenHealth;
  expiresAt: string;
  lastRefresh: string;
  consecutiveFailures: number;
  error?: string;
}

// ── Platform TTL Configuration ────────────────────────

interface PlatformTokenConfig {
  platform: AdPlatform;
  accessTokenTtlHours: number;   // How long the access token lives
  refreshTokenTtlDays: number;   // How long the refresh token lives (0 = never expires)
  refreshEndpoint: string;
  revokeEndpoint?: string;
}

const PLATFORM_CONFIGS: PlatformTokenConfig[] = [
  { platform: 'meta',     accessTokenTtlHours: 1440, refreshTokenTtlDays: 0,  refreshEndpoint: 'https://graph.facebook.com/v19.0/oauth/access_token' },
  { platform: 'google',   accessTokenTtlHours: 1,    refreshTokenTtlDays: 0,  refreshEndpoint: 'https://oauth2.googleapis.com/token' },
  { platform: 'tiktok',   accessTokenTtlHours: 24,   refreshTokenTtlDays: 365, refreshEndpoint: 'https://business-api.tiktok.com/open_api/v1.3/oauth2/access_token/' },
  { platform: 'linkedin', accessTokenTtlHours: 1440, refreshTokenTtlDays: 365, refreshEndpoint: 'https://www.linkedin.com/oauth/v2/accessToken' },
  { platform: 'twitter',  accessTokenTtlHours: 0,    refreshTokenTtlDays: 0,  refreshEndpoint: '' }, // OAuth 1.0a — tokens don't expire
  { platform: 'reddit',   accessTokenTtlHours: 1,    refreshTokenTtlDays: 0,  refreshEndpoint: 'https://www.reddit.com/api/v1/access_token' },
];

// ── Refresh Logic ─────────────────────────────────────

const REFRESH_AT_TTL_PERCENT = 0.80; // Refresh at 80% of TTL
const MAX_CONSECUTIVE_FAILURES = 3;

/**
 * Check if a token needs refresh.
 * Returns true if the token is past 80% of its TTL.
 */
function needsRefresh(token: OAuthTokenSet): boolean {
  const config = PLATFORM_CONFIGS.find(c => c.platform === token.platform);
  if (!config || config.accessTokenTtlHours === 0) return false; // Never expires (Twitter OAuth 1.0a)

  const expiresAt = new Date(token.expiresAt).getTime();
  const lastRefresh = new Date(token.lastRefreshedAt).getTime();
  const ttlMs = config.accessTokenTtlHours * 60 * 60 * 1000;
  const refreshAt = lastRefresh + (ttlMs * REFRESH_AT_TTL_PERCENT);

  return Date.now() >= refreshAt;
}

/**
 * Determine the health status of a token.
 */
function getTokenHealth(token: OAuthTokenSet, failures: number): TokenHealth {
  if (failures >= MAX_CONSECUTIVE_FAILURES) return 'requires_reauth';

  const now = Date.now();
  const expiresAt = new Date(token.expiresAt).getTime();

  if (expiresAt < now) return 'expired';

  const config = PLATFORM_CONFIGS.find(c => c.platform === token.platform);
  if (!config || config.accessTokenTtlHours === 0) return 'healthy'; // Never expires

  const ttlMs = config.accessTokenTtlHours * 60 * 60 * 1000;
  const warningAt = expiresAt - (ttlMs * 0.2); // Warn at 80% consumed

  if (now >= warningAt) return 'expiring_soon';
  if (failures > 0) return 'refresh_failed';
  return 'healthy';
}

// ── Failure Escalation (§9.5) ─────────────────────────

interface RefreshResult {
  success: boolean;
  newTokens?: OAuthTokenSet;
  error?: string;
  requiresReauth?: boolean;
}

/**
 * Handle a refresh failure. Implements the escalation:
 * 1st failure: retry after 30s
 * 2nd failure: retry after 60s
 * 3rd failure: pause campaigns on this platform, set requires_reauth, alert
 *
 * The `invalid_grant` error means the refresh token itself is expired/revoked.
 * This does NOT count toward the 3-failure pause trigger (§9.18) —
 * it goes straight to requires_reauth.
 */
function handleRefreshFailure(
  platform: AdPlatform,
  error: string,
  consecutiveFailures: number
): { action: 'retry' | 'pause_and_alert' | 'reauth'; retryAfterMs?: number } {
  // invalid_grant = refresh token revoked/expired — immediate reauth
  if (error.includes('invalid_grant') || error.includes('revoked')) {
    return { action: 'reauth' };
  }

  const newCount = consecutiveFailures + 1;
  if (newCount >= MAX_CONSECUTIVE_FAILURES) {
    return { action: 'pause_and_alert' };
  }

  // Exponential backoff: 30s, 60s
  const retryAfterMs = 30000 * Math.pow(2, consecutiveFailures);
  return { action: 'retry', retryAfterMs };
}

// ── Vault Integration ─────────────────────────────────
// Tokens are stored in the financial vault, keyed by platform name.
// The daemon reads them at startup and holds them in memory.
// On refresh, the daemon writes the updated token back to the vault.

const TOKEN_VAULT_KEY_PREFIX = 'growth/tokens/';

function tokenVaultKey(platform: AdPlatform): string {
  return TOKEN_VAULT_KEY_PREFIX + platform;
}

/**
 * Serialize tokens for vault storage.
 * The vault stores strings — tokens are JSON-serialized.
 */
function serializeTokens(tokens: OAuthTokenSet): string {
  return JSON.stringify(tokens);
}

function deserializeTokens(data: string): OAuthTokenSet {
  return JSON.parse(data) as OAuthTokenSet;
}

// ── Session Token Rotation (§9.19.15) ─────────────────
// The daemon session token (heartbeat.token) rotates every 24 hours.
// During rotation, accept both old and new tokens for 30-second grace period.

const SESSION_TOKEN_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const SESSION_TOKEN_GRACE_MS = 30 * 1000; // 30 seconds

interface SessionTokenState {
  current: string;
  previous?: string;
  rotatedAt: number;
  previousExpiresAt?: number;
}

function shouldRotateSessionToken(state: SessionTokenState): boolean {
  return Date.now() - state.rotatedAt >= SESSION_TOKEN_TTL_MS;
}

function rotateSessionToken(state: SessionTokenState, newToken: string): SessionTokenState {
  return {
    current: newToken,
    previous: state.current,
    rotatedAt: Date.now(),
    previousExpiresAt: Date.now() + SESSION_TOKEN_GRACE_MS,
  };
}

function validateSessionToken(provided: string, state: SessionTokenState): boolean {
  const { timingSafeEqual } = require('node:crypto');

  // Check current token
  if (provided.length === state.current.length) {
    const a = Buffer.from(provided);
    const b = Buffer.from(state.current);
    if (timingSafeEqual(a, b)) return true;
  }

  // Check previous token during grace period
  if (state.previous && state.previousExpiresAt && Date.now() < state.previousExpiresAt) {
    if (provided.length === state.previous.length) {
      const a = Buffer.from(provided);
      const b = Buffer.from(state.previous);
      if (timingSafeEqual(a, b)) return true;
    }
  }

  return false;
}

export type { OAuthTokenSet, TokenHealth, TokenStatus, PlatformTokenConfig, RefreshResult, SessionTokenState };
export {
  PLATFORM_CONFIGS, REFRESH_AT_TTL_PERCENT, MAX_CONSECUTIVE_FAILURES,
  needsRefresh, getTokenHealth, handleRefreshFailure,
  tokenVaultKey, serializeTokens, deserializeTokens,
  SESSION_TOKEN_TTL_MS, SESSION_TOKEN_GRACE_MS,
  shouldRotateSessionToken, rotateSessionToken, validateSessionToken,
};
