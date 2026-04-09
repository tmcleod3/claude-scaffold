/**
 * Pattern: Ad Platform Adapter (Split Interface)
 *
 * Key principles:
 * - Separate interactive setup (browser OAuth) from runtime operations (daemon)
 * - AdPlatformSetup runs in CLI/Danger Room (interactive, user-present)
 * - AdPlatformAdapter runs in heartbeat daemon (non-interactive, autonomous)
 * - All amounts in integer cents (Cents branded type) — never float
 * - Rate limiting per-platform with token bucket
 * - Errors normalized to common PlatformError format
 * - Idempotency keys on all write operations (WAL pattern per ADR-3)
 *
 * Agents: Breeze (platform relations), Wax (paid ads), Dockson (treasury)
 *
 * PRD Reference: §9.5, §9.19.10, §9.20.4
 *
 * Authorization Guard (§9.20.4):
 *   Daemon Tier 1 jobs receive ReadOnlyAdapter (pause, read operations only).
 *   Authenticated external commands receive full AdPlatformAdapter.
 *   See financial-transaction.ts for the Cents branded type.
 */

// ── Branded Financial Types (§9.17) ───────────────────

type Cents = number & { readonly __brand: 'Cents' };
type Percentage = number & { readonly __brand: 'Percentage' };
type Ratio = number & { readonly __brand: 'Ratio' };

function toCents(dollars: number): Cents {
  return Math.round(dollars * 100) as Cents;
}

function toDollars(cents: Cents): number {
  return cents / 100;
}

// ── Platform Types ────────────────────────────────────

type AdPlatform = 'meta' | 'google' | 'tiktok' | 'linkedin' | 'twitter' | 'reddit' | 'snap';

interface OAuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: string;       // ISO 8601
  platform: AdPlatform;
  scopes: string[];
}

interface ConnectionStatus {
  connected: boolean;
  accountId?: string;
  accountName?: string;
  currency?: string;       // ISO 4217 — must be 'USD' per ADR-6
  error?: string;
}

// ── Error Normalization ───────────────────────────────

interface PlatformError {
  platform: AdPlatform;
  code: 'RATE_LIMITED' | 'AUTH_EXPIRED' | 'BUDGET_EXCEEDED' | 'CREATIVE_REJECTED' | 'UNKNOWN';
  originalCode: number;
  message: string;
  retryable: boolean;
  retryAfter?: number;     // seconds
}

// ── Campaign Types ────────────────────────────────────

interface CampaignConfig {
  name: string;
  platform: AdPlatform;
  objective: 'awareness' | 'traffic' | 'conversions';
  dailyBudget: Cents;
  targeting: {
    audiences: string[];
    locations: string[];
    ageRange?: [number, number];
    interests?: string[];
  };
  creative: {
    headlines: string[];
    descriptions: string[];
    callToAction: string;
    landingUrl: string;
    imageUrls?: string[];
  };
  testGroupId?: string;
  testVariant?: string;
  schedule?: {
    startDate?: string;
    endDate?: string;
  };
  idempotencyKey: string;  // UUID, per ADR-3
  complianceStatus: 'passed' | 'pending';
}

interface CampaignResult {
  externalId: string;
  platform: AdPlatform;
  status: 'created' | 'pending_review';
  dashboardUrl: string;
}

interface CampaignUpdate {
  name?: string;
  dailyBudget?: Cents;
  targeting?: Partial<CampaignConfig['targeting']>;
  schedule?: CampaignConfig['schedule'];
}

interface CreativeConfig {
  headlines?: string[];
  descriptions?: string[];
  callToAction?: string;
  landingUrl?: string;
  imageUrls?: string[];
}

interface SpendReport {
  platform: AdPlatform;
  dateRange: { start: string; end: string };
  totalSpend: Cents;
  campaigns: Array<{
    externalId: string;
    spend: Cents;
    impressions: number;
    clicks: number;
    conversions: number;
  }>;
}

interface PerformanceMetrics {
  campaignId: string;
  impressions: number;
  clicks: number;
  conversions: number;
  spend: Cents;
  ctr: Percentage;
  cpc: Cents;
  roas: Ratio;
}

interface InsightData {
  campaignId: string;
  metrics: Record<string, number>;
  recommendations?: string[];
}

// ── Interactive Setup Interface ───────────────────────
// Runs in CLI or Danger Room — requires user interaction (browser OAuth)

interface AdPlatformSetup {
  /** Interactive OAuth flow — opens browser for authorization */
  authenticate(): Promise<OAuthTokens>;

  /** Verify the connection works and return account info */
  verifyConnection(tokens: OAuthTokens): Promise<ConnectionStatus>;

  /** Detect account currency for ADR-6 enforcement */
  detectCurrency(tokens: OAuthTokens): Promise<string>;
}

// ── Runtime Adapter Interface ─────────────────────────
// Runs in the heartbeat daemon — non-interactive, autonomous

interface AdPlatformAdapter {
  // Token management
  refreshToken(token: OAuthTokens): Promise<OAuthTokens>;

  // Campaign CRUD (requires FullAdapter auth — see Authorization Guard)
  createCampaign(config: CampaignConfig): Promise<CampaignResult>;
  updateCampaign(id: string, changes: CampaignUpdate): Promise<void>;
  pauseCampaign(id: string): Promise<void>;
  resumeCampaign(id: string): Promise<void>;
  deleteCampaign(id: string): Promise<void>;

  // Budget and creative (requires FullAdapter auth)
  updateBudget(id: string, dailyBudget: Cents): Promise<void>;
  updateCreative(id: string, creative: CreativeConfig): Promise<void>;

  // Reporting (read-only — available to ReadOnlyAdapter)
  getSpend(dateRange: { start: string; end: string }): Promise<SpendReport>;
  getPerformance(campaignId: string): Promise<PerformanceMetrics>;
  getInsights(campaignId: string, metrics: string[]): Promise<InsightData>;

  // Webhooks (deferred to remote mode per ADR-5)
  handleWebhook?(payload: unknown): Promise<{ processed: boolean }>;
  verifyWebhookSignature?(payload: Buffer, signature: string): boolean;
}

// ── Authorization Guard (§9.20.4) ─────────────────────
// Daemon Tier 1 jobs receive this restricted interface

type ReadOnlyAdapter = Pick<AdPlatformAdapter,
  'pauseCampaign' |    // Protective — stopping spend is always safe
  'getSpend' |
  'getPerformance' |
  'getInsights' |
  'refreshToken'
>;

// Authenticated external commands receive the full AdPlatformAdapter
//
// ── Adapter Caching Rule (field report #258) ────────────
// Stateful adapters (in-memory campaign store, e.g. sandbox) MUST be cached
// per platform — one instance per platform key. Creating a new instance per
// call loses state between operations (campaigns created become invisible).
// Stateless adapters (HTTP clients calling external APIs) can be created per
// call since they hold no local state. Use a module-level Map<string, Adapter>
// for caching when the adapter's constructor initializes mutable collections.

// ── Reference Implementation: Meta Marketing API ──────

class MetaAdapter implements AdPlatformSetup, AdPlatformAdapter {
  private readonly baseUrl = 'https://graph.facebook.com/v19.0';
  private rateLimiter: TokenBucketLimiter;

  constructor(private adAccountId: string) {
    // Meta: 200 calls/hr/ad account (sliding window)
    this.rateLimiter = new TokenBucketLimiter({ capacity: 200, refillRate: 200 / 3600 });
  }

  // ── Setup (interactive) ──────────

  async authenticate(): Promise<OAuthTokens> {
    // 1. Open browser to Facebook Login
    // 2. User authorizes → callback with short-lived token
    // 3. Exchange for long-lived token (60 days)
    // 4. Return OAuthTokens
    throw new Error('Interactive OAuth — implement per platform');
  }

  async verifyConnection(tokens: OAuthTokens): Promise<ConnectionStatus> {
    const res = await this.apiCall('GET', `/act_${this.adAccountId}`, tokens, {
      fields: 'name,currency,account_status'
    });
    return {
      connected: true,
      accountId: this.adAccountId,
      accountName: res.name as string | undefined,
      currency: res.currency as string | undefined,
    };
  }

  async detectCurrency(tokens: OAuthTokens): Promise<string> {
    const status = await this.verifyConnection(tokens);
    return status.currency ?? 'USD';
  }

  // ── Runtime (daemon) ─────────────

  async refreshToken(token: OAuthTokens): Promise<OAuthTokens> {
    // Meta long-lived tokens: exchange at 80% of 60-day TTL
    const res = await this.apiCall('GET', '/oauth/access_token', token, {
      grant_type: 'fb_exchange_token',
      fb_exchange_token: token.accessToken,
    });
    return { ...token, accessToken: res.access_token as string, expiresAt: res.expires_at as string };
  }

  async createCampaign(config: CampaignConfig): Promise<CampaignResult> {
    await this.rateLimiter.acquire();
    const res = await this.apiCall('POST', `/act_${this.adAccountId}/campaigns`, undefined, {
      name: config.name,
      objective: this.mapObjective(config.objective),
      status: 'PAUSED',  // Create paused, activate after ad set + ad creation
      special_ad_categories: [],
    });
    return {
      externalId: res.id as string,
      platform: 'meta',
      status: 'created',
      dashboardUrl: `https://www.facebook.com/adsmanager/manage/campaigns?act=${this.adAccountId}&campaign_ids=${res.id}`,
    };
  }

  async pauseCampaign(id: string): Promise<void> {
    await this.rateLimiter.acquire();
    await this.apiCall('POST', `/${id}`, undefined, { status: 'PAUSED' });
  }

  async resumeCampaign(id: string): Promise<void> {
    await this.rateLimiter.acquire();
    await this.apiCall('POST', `/${id}`, undefined, { status: 'ACTIVE' });
  }

  async deleteCampaign(id: string): Promise<void> {
    await this.rateLimiter.acquire();
    await this.apiCall('DELETE', `/${id}`, undefined, {});
  }

  async updateCampaign(id: string, changes: CampaignUpdate): Promise<void> {
    await this.rateLimiter.acquire();
    const params: Record<string, unknown> = {};
    if (changes.name) params.name = changes.name;
    // Budget changes go through ad set, not campaign on Meta
    await this.apiCall('POST', `/${id}`, undefined, params);
  }

  async updateBudget(id: string, dailyBudget: Cents): Promise<void> {
    await this.rateLimiter.acquire();
    // Meta budgets are in the account's currency smallest unit (cents for USD)
    await this.apiCall('POST', `/${id}`, undefined, { daily_budget: dailyBudget });
  }

  async updateCreative(id: string, creative: CreativeConfig): Promise<void> {
    await this.rateLimiter.acquire();
    // Creative updates go through the ad object, not campaign
    throw new Error('Creative update requires ad-level API call — implement per ad structure');
  }

  async getSpend(dateRange: { start: string; end: string }): Promise<SpendReport> {
    await this.rateLimiter.acquire();
    const res = await this.apiCall('GET', `/act_${this.adAccountId}/insights`, undefined, {
      fields: 'campaign_id,spend,impressions,clicks,conversions',
      time_range: JSON.stringify({ since: dateRange.start, until: dateRange.end }),
      level: 'campaign',
    });
    const resData = res.data as Array<Record<string, string>>;
    return {
      platform: 'meta',
      dateRange,
      totalSpend: toCents(resData.reduce((sum: number, r: Record<string, string>) => sum + parseFloat(r.spend), 0)),
      campaigns: resData.map((r: Record<string, string>) => ({
        externalId: r.campaign_id,
        spend: toCents(parseFloat(r.spend)),
        impressions: parseInt(r.impressions),
        clicks: parseInt(r.clicks),
        conversions: parseInt(r.conversions || '0'),
      })),
    };
  }

  async getPerformance(campaignId: string): Promise<PerformanceMetrics> {
    await this.rateLimiter.acquire();
    const res = await this.apiCall('GET', `/${campaignId}/insights`, undefined, {
      fields: 'impressions,clicks,conversions,spend,ctr,cpc',
    });
    const d = (res.data as Array<Record<string, string>>)[0];
    const spend = toCents(parseFloat(d.spend));
    const conversions = parseInt(d.conversions || '0');
    const revenue = 0 as Cents; // Revenue comes from Stripe, not the ad platform
    return {
      campaignId,
      impressions: parseInt(d.impressions),
      clicks: parseInt(d.clicks),
      conversions,
      spend,
      ctr: parseFloat(d.ctr) as Percentage,
      cpc: toCents(parseFloat(d.cpc)),
      roas: (revenue > 0 ? toDollars(revenue) / toDollars(spend) : 0) as Ratio,
    };
  }

  async getInsights(campaignId: string, metrics: string[]): Promise<InsightData> {
    await this.rateLimiter.acquire();
    const res = await this.apiCall('GET', `/${campaignId}/insights`, undefined, {
      fields: metrics.join(','),
    });
    return { campaignId, metrics: (res.data as Array<Record<string, number>>)[0] ?? {} };
  }

  // ── Helpers ──────────────────────

  private mapObjective(obj: CampaignConfig['objective']): string {
    const map = { awareness: 'OUTCOME_AWARENESS', traffic: 'OUTCOME_TRAFFIC', conversions: 'OUTCOME_SALES' };
    return map[obj];
  }

  private async apiCall(
    method: string, path: string, tokens: OAuthTokens | undefined, params: Record<string, unknown>
  ): Promise<Record<string, unknown>> {
    // Sanitize platform response data per §9.19.16
    // All string fields: strip HTML tags, escape <>&"', truncate to 500 chars
    // Use idempotency key for POST/DELETE per ADR-3
    throw new Error('HTTP implementation — use node:https, no SDK dependencies');
  }
}

// ── Token Bucket Rate Limiter ─────────────────────────

class TokenBucketLimiter {
  private tokens: number;
  private lastRefill: number;
  private readonly capacity: number;
  private readonly refillRate: number; // tokens per second

  constructor(opts: { capacity: number; refillRate: number }) {
    this.capacity = opts.capacity;
    this.refillRate = opts.refillRate;
    this.tokens = opts.capacity;
    this.lastRefill = Date.now();
  }

  async acquire(): Promise<void> {
    this.refill();
    if (this.tokens < 1) {
      const waitMs = (1 / this.refillRate) * 1000;
      await new Promise(resolve => setTimeout(resolve, waitMs));
      this.refill();
    }
    this.tokens -= 1;
  }

  private refill(): void {
    const now = Date.now();
    const elapsed = (now - this.lastRefill) / 1000;
    this.tokens = Math.min(this.capacity, this.tokens + elapsed * this.refillRate);
    this.lastRefill = now;
  }
}

export type {
  AdPlatformSetup, AdPlatformAdapter, ReadOnlyAdapter,
  CampaignConfig, CampaignResult, CampaignUpdate, CreativeConfig,
  SpendReport, PerformanceMetrics, InsightData,
  OAuthTokens, ConnectionStatus, PlatformError,
  Cents, Percentage, Ratio, AdPlatform,
};
export { toCents, toDollars, MetaAdapter, TokenBucketLimiter };
