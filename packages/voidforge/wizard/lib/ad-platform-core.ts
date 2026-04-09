/**
 * Ad platform core — re-exports from the ad-platform-adapter pattern for wizard runtime use.
 * ARCH-R2-012: Production code should not import from docs/patterns/ directly.
 */
export type {
  AdPlatformSetup, AdPlatformAdapter, ReadOnlyAdapter,
  CampaignConfig, CampaignResult, CampaignUpdate, CreativeConfig,
  SpendReport, PerformanceMetrics, InsightData,
  OAuthTokens, ConnectionStatus, PlatformError,
  Cents, Percentage, Ratio, AdPlatform,
} from './patterns/ad-platform-adapter.js';
export { toCents, toDollars } from './patterns/ad-platform-adapter.js';
