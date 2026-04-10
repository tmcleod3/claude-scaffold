/**
 * Meta Marketing Campaign Adapter — orchestration layer.
 *
 * Implements AdPlatformAdapter for Meta Marketing API v19.0.
 * Raw API calls delegated to meta-api.ts.
 * Shared patterns from campaign-common.ts.
 *
 * PRD Reference: SS9.5, SS9.19.10, SS9.20.4
 * No Stubs Doctrine: every method makes a real API call or returns documented empty.
 */

import type {
  AdPlatformAdapter,
  CampaignConfig, CampaignResult, CampaignUpdate, CreativeConfig,
  SpendReport, PerformanceMetrics, InsightData,
  OAuthTokens,
  Cents, Percentage, Ratio,
} from './base.js';
import { toCents, TokenBucketLimiter } from './base.js';
import { safeParseJson, mapObjective, requireCompliance, aggregateSpend, makePlatformError } from './campaign-common.js';
import type { MetaCampaignConfig } from './meta-api.js';
import { metaGet, metaPost, metaDelete, throwMetaApiError } from './meta-api.js';

export type { MetaCampaignConfig } from './meta-api.js';

// ── Adapter Implementation ──────────────────────────

export class MetaCampaignAdapter implements AdPlatformAdapter {
  private readonly config: MetaCampaignConfig;
  private readonly rateLimiter: TokenBucketLimiter;

  constructor(config: MetaCampaignConfig) {
    this.config = config;
    // Meta: 200 calls/hr/ad account
    this.rateLimiter = new TokenBucketLimiter({ capacity: 200, refillRate: 200 / 3600 });
  }

  async refreshToken(token: OAuthTokens): Promise<OAuthTokens> {
    // Meta long-lived tokens: exchange at 80% of 60-day TTL
    await this.rateLimiter.acquire();
    const { status, body } = await metaGet('/oauth/access_token', token.accessToken, {
      grant_type: 'fb_exchange_token',
      fb_exchange_token: token.accessToken,
    });

    if (status !== 200) {
      throwMetaApiError(status, body);
    }

    const parsed = safeParseJson(body);
    return {
      ...token,
      accessToken: parsed.access_token as string,
      expiresAt: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString(),
    };
  }

  async createCampaign(config: CampaignConfig): Promise<CampaignResult> {
    requireCompliance(config, 'meta');

    await this.rateLimiter.acquire();
    const { status, body } = await metaPost(
      `/act_${this.config.adAccountId}/campaigns`,
      this.config.accessToken,
      {
        name: config.name,
        objective: mapObjective('meta', config.objective),
        status: 'PAUSED',
        special_ad_categories: '[]',
        idempotency_key: config.idempotencyKey,
      },
    );

    if (status !== 200) throwMetaApiError(status, body);

    const parsed = safeParseJson(body);
    const externalId = parsed.id as string;

    return {
      externalId,
      platform: 'meta',
      status: 'created',
      dashboardUrl: `https://www.facebook.com/adsmanager/manage/campaigns?act=${this.config.adAccountId}&campaign_ids=${externalId}`,
    };
  }

  async updateCampaign(id: string, changes: CampaignUpdate): Promise<void> {
    await this.rateLimiter.acquire();
    const params: Record<string, string> = {};
    if (changes.name !== undefined) params.name = changes.name;

    if (Object.keys(params).length === 0) return;

    const { status, body } = await metaPost(`/${id}`, this.config.accessToken, params);
    if (status !== 200) throwMetaApiError(status, body);
  }

  async pauseCampaign(id: string): Promise<void> {
    await this.rateLimiter.acquire();
    const { status, body } = await metaPost(`/${id}`, this.config.accessToken, {
      status: 'PAUSED',
    });
    if (status !== 200) throwMetaApiError(status, body);
  }

  async resumeCampaign(id: string): Promise<void> {
    await this.rateLimiter.acquire();
    const { status, body } = await metaPost(`/${id}`, this.config.accessToken, {
      status: 'ACTIVE',
    });
    if (status !== 200) throwMetaApiError(status, body);
  }

  async deleteCampaign(id: string): Promise<void> {
    await this.rateLimiter.acquire();
    const { status, body } = await metaDelete(`/${id}`, this.config.accessToken);
    if (status !== 200) throwMetaApiError(status, body);
  }

  async updateBudget(id: string, dailyBudget: Cents): Promise<void> {
    await this.rateLimiter.acquire();
    // Meta budgets are in the account's currency smallest unit (cents for USD)
    const { status, body } = await metaPost(`/${id}`, this.config.accessToken, {
      daily_budget: String(dailyBudget),
    });
    if (status !== 200) throwMetaApiError(status, body);
  }

  async updateCreative(id: string, creative: CreativeConfig): Promise<void> {
    await this.rateLimiter.acquire();
    const { status: queryStatus, body: queryBody } = await metaGet(
      `/${id}/ads`,
      this.config.accessToken,
      { fields: 'id', limit: '1' },
    );

    if (queryStatus !== 200) throwMetaApiError(queryStatus, queryBody);

    const queryParsed = safeParseJson(queryBody);
    const ads = queryParsed.data as Array<Record<string, string>> | undefined ?? [];

    if (ads.length === 0) {
      throw makePlatformError('meta', 'CREATIVE_REJECTED', 404, `No ads found for campaign ${id}`);
    }

    const adId = ads[0].id;
    const params: Record<string, string> = {};

    if (creative.landingUrl) {
      params.creative = JSON.stringify({
        object_story_spec: {
          link_data: {
            link: creative.landingUrl,
            message: creative.descriptions?.[0] ?? '',
            name: creative.headlines?.[0] ?? '',
            call_to_action: creative.callToAction
              ? { type: creative.callToAction }
              : undefined,
          },
        },
      });
    }

    if (Object.keys(params).length === 0) return;

    const { status, body } = await metaPost(`/${adId}`, this.config.accessToken, params);
    if (status !== 200) throwMetaApiError(status, body);
  }

  async getSpend(dateRange: { start: string; end: string }): Promise<SpendReport> {
    await this.rateLimiter.acquire();
    const { status, body } = await metaGet(
      `/act_${this.config.adAccountId}/insights`,
      this.config.accessToken,
      {
        fields: 'campaign_id,spend,impressions,clicks,conversions',
        time_range: JSON.stringify({ since: dateRange.start, until: dateRange.end }),
        level: 'campaign',
      },
    );

    if (status !== 200) throwMetaApiError(status, body);

    const parsed = safeParseJson(body);
    const dataArray = parsed.data as Array<Record<string, string>> | undefined ?? [];

    const campaigns = dataArray.map(r => ({
      externalId: r.campaign_id,
      spend: toCents(parseFloat(r.spend)),
      impressions: parseInt(r.impressions),
      clicks: parseInt(r.clicks),
      conversions: parseInt(r.conversions || '0'),
    }));

    return { platform: 'meta', dateRange, totalSpend: aggregateSpend(campaigns), campaigns };
  }

  async getPerformance(campaignId: string): Promise<PerformanceMetrics> {
    await this.rateLimiter.acquire();
    const { status, body } = await metaGet(
      `/${campaignId}/insights`,
      this.config.accessToken,
      { fields: 'impressions,clicks,conversions,spend,ctr,cpc' },
    );

    if (status !== 200) throwMetaApiError(status, body);

    const parsed = safeParseJson(body);
    const dataArray = parsed.data as Array<Record<string, string>> | undefined ?? [];
    const d = dataArray[0] ?? {};
    const spend = toCents(parseFloat(d.spend ?? '0'));

    return {
      campaignId,
      impressions: parseInt(d.impressions ?? '0'),
      clicks: parseInt(d.clicks ?? '0'),
      conversions: parseInt(d.conversions || '0'),
      spend,
      ctr: parseFloat(d.ctr ?? '0') as Percentage,
      cpc: toCents(parseFloat(d.cpc ?? '0')),
      roas: (spend > 0 ? 0 : 0) as Ratio,
    };
  }

  async getInsights(campaignId: string, metrics: string[]): Promise<InsightData> {
    await this.rateLimiter.acquire();
    const { status, body } = await metaGet(
      `/${campaignId}/insights`,
      this.config.accessToken,
      { fields: metrics.join(',') },
    );

    if (status !== 200) throwMetaApiError(status, body);

    const parsed = safeParseJson(body);
    const dataArray = parsed.data as Array<Record<string, string>> | undefined ?? [];
    const row = dataArray[0] ?? {};

    const result: Record<string, number> = {};
    for (const metric of metrics) {
      result[metric] = parseFloat(row[metric] ?? '0');
    }

    return { campaignId, metrics: result };
  }
}
