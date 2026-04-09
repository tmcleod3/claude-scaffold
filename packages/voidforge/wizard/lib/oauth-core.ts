/**
 * OAuth core — re-exports from the oauth-token-lifecycle pattern for wizard runtime use.
 * ARCH-R2-012: Production code should not import from docs/patterns/ directly.
 */
export {
  needsRefresh, handleRefreshFailure, getTokenHealth,
  tokenVaultKey, deserializeTokens,
  shouldRotateSessionToken, rotateSessionToken, validateSessionToken,
} from './patterns/oauth-token-lifecycle.js';
export type { SessionTokenState } from './patterns/oauth-token-lifecycle.js';
