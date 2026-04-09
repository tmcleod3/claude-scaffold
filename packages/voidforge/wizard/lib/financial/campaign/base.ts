/**
 * Campaign adapter types — re-exports from the pattern file.
 * ARCH-R2-012: Production code should not import from docs/patterns/ directly.
 *
 * The AdPlatformAdapter interface defines campaign CRUD operations:
 * create, pause, resume, delete, updateBudget, updateCreative,
 * plus reporting (getSpend, getPerformance, getInsights).
 *
 * Split interface: AdPlatformSetup (interactive CLI) + AdPlatformAdapter (daemon runtime).
 * ReadOnlyAdapter restricts daemon Tier 1 jobs to safe operations only.
 */
export type {
  AdPlatformSetup, AdPlatformAdapter, ReadOnlyAdapter,
  CampaignConfig, CampaignResult, CampaignUpdate, CreativeConfig,
  SpendReport, PerformanceMetrics, InsightData,
  OAuthTokens, ConnectionStatus, PlatformError,
  Cents, Percentage, Ratio, AdPlatform,
} from '../../../../../../docs/patterns/ad-platform-adapter.js';

export { toCents, toDollars, TokenBucketLimiter } from '../../../../../../docs/patterns/ad-platform-adapter.js';
