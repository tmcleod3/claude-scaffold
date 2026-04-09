/**
 * Ad Platform Adapter Types — shared across all platform implementations.
 * Re-exports from the pattern file for convenience.
 *
 * PRD Reference: §9.5, §9.19.10, §9.20.4
 */

export type {
  AdPlatformSetup, AdPlatformAdapter, ReadOnlyAdapter,
  CampaignConfig, CampaignResult, CampaignUpdate, CreativeConfig,
  SpendReport, PerformanceMetrics, InsightData,
  OAuthTokens, ConnectionStatus, PlatformError,
  Cents, Percentage, Ratio, AdPlatform,
} from '../ad-platform-core.js';

export { toCents, toDollars } from '../ad-platform-core.js';
// Note: TokenBucketLimiter in ad-platform-adapter.ts is the simple reference version.
// Production adapters use OutboundRateLimiter (below) which has safety margins, daily quotas, and retry logic.
export { OutboundRateLimiter, getLimiter } from '../rate-limiter-core.js';
