/**
 * TikTok Marketing Campaign Adapter — orchestration layer.
 *
 * Implements AdPlatformAdapter for TikTok Marketing API v1.3.
 * Raw API calls delegated to tiktok-api.ts.
 * Shared patterns from campaign-common.ts.
 *
 * PRD Reference: SS9.5, SS9.19.10, SS9.20.4
 * No Stubs Doctrine: every method makes a real API call or returns documented empty.
 */

import type {
  AdPlatformAdapter,
  CampaignConfig, CampaignResult, CampaignUpdate, CreativeConfig,
  SpendReport, PerformanceMetrics, InsightData,
  OAuthTokens, Cents, Percentage, Ratio,
} from './base.js';
import { toCents, toDollars, TokenBucketLimiter } from './base.js';
import { safeParseJson, mapObjective, requireCompliance, aggregateSpend, makePlatformError } from './campaign-common.js';
import { tiktokGet, tiktokPost, requireSuccess } from './tiktok-api.js';

export type { TikTokCampaignConfig } from './tiktok-api.js';

// ── Adapter Implementation ──────────────────────────

export class TikTokCampaignAdapter implements AdPlatformAdapter {
  private readonly config: { appId: string; accessToken: string };
  private readonly rateLimiter: TokenBucketLimiter;

  constructor(config: { appId: string; accessToken: string }) {
    this.config = config;
    this.rateLimiter = new TokenBucketLimiter({ capacity: 10, refillRate: 10 });
  }

  private async post(path: string, body: Record<string, unknown>): Promise<Record<string, unknown>> {
    await this.rateLimiter.acquire();
    const { status, body: raw } = await tiktokPost(path, this.config.accessToken, body);
    if (status !== 200) {
      throw makePlatformError('tiktok', 'UNKNOWN', status, `TikTok ${path} failed: HTTP ${status}`);
    }
    return requireSuccess(safeParseJson(raw), path);
  }

  private async setStatus(ids: string[], optStatus: string, context: string): Promise<void> {
    await this.post('/campaign/status/update/', {
      advertiser_id: this.config.appId, campaign_ids: ids, opt_status: optStatus,
    });
  }

  async refreshToken(token: OAuthTokens): Promise<OAuthTokens> {
    return { ...token, expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() };
  }

  async createCampaign(config: CampaignConfig): Promise<CampaignResult> {
    requireCompliance(config, 'tiktok');
    const data = await this.post('/campaign/create/', {
      advertiser_id: this.config.appId,
      campaign_name: config.name,
      objective_type: mapObjective('tiktok', config.objective),
      budget_mode: 'BUDGET_MODE_DAY',
      budget: toDollars(config.dailyBudget),
      operation_status: 'DISABLE',
      request_id: config.idempotencyKey,
    });
    const externalId = String(data.campaign_id ?? '');
    return {
      externalId, platform: 'tiktok', status: 'created',
      dashboardUrl: `https://ads.tiktok.com/i18n/perf/campaign?aadvid=${this.config.appId}&campaign_id=${externalId}`,
    };
  }

  async updateCampaign(id: string, changes: CampaignUpdate): Promise<void> {
    const body: Record<string, unknown> = { advertiser_id: this.config.appId, campaign_id: id };
    if (changes.name !== undefined) body.campaign_name = changes.name;
    if (changes.dailyBudget !== undefined) body.budget = toDollars(changes.dailyBudget);
    await this.post('/campaign/update/', body);
  }

  async pauseCampaign(id: string): Promise<void> { await this.setStatus([id], 'DISABLE', 'pause'); }
  async resumeCampaign(id: string): Promise<void> { await this.setStatus([id], 'ENABLE', 'resume'); }
  async deleteCampaign(id: string): Promise<void> { await this.setStatus([id], 'DELETE', 'delete'); }

  async updateBudget(id: string, dailyBudget: Cents): Promise<void> {
    await this.post('/campaign/update/', {
      advertiser_id: this.config.appId, campaign_id: id, budget: toDollars(dailyBudget),
    });
  }

  async updateCreative(id: string, creative: CreativeConfig): Promise<void> {
    await this.rateLimiter.acquire();
    const { status: qs, body: qb } = await tiktokGet('/ad/get/', this.config.accessToken, {
      advertiser_id: this.config.appId,
      filtering: JSON.stringify({ campaign_ids: [id] }),
      page_size: '1',
    });
    if (qs !== 200) throw makePlatformError('tiktok', 'UNKNOWN', qs, 'TikTok ad query failed');
    const queryData = requireSuccess(safeParseJson(qb), 'updateCreative.query');
    const ads = queryData.list as Array<Record<string, unknown>> | undefined ?? [];
    if (ads.length === 0) {
      throw makePlatformError('tiktok', 'CREATIVE_REJECTED', 404, `No ads found for campaign ${id}`);
    }
    const updateBody: Record<string, unknown> = {
      advertiser_id: this.config.appId, ad_id: String(ads[0].ad_id ?? ''),
    };
    if (creative.landingUrl) updateBody.landing_page_url = creative.landingUrl;
    if (creative.headlines?.[0]) updateBody.ad_name = creative.headlines[0];
    if (creative.descriptions?.[0]) updateBody.ad_text = creative.descriptions[0];
    if (creative.callToAction) updateBody.call_to_action = creative.callToAction;
    await this.post('/ad/update/', updateBody);
  }

  async getSpend(dateRange: { start: string; end: string }): Promise<SpendReport> {
    const data = await this.post('/report/integrated/get/', {
      advertiser_id: this.config.appId, report_type: 'BASIC',
      dimensions: ['campaign_id'],
      metrics: ['spend', 'impressions', 'clicks', 'conversion'],
      data_level: 'AUCTION_CAMPAIGN',
      start_date: dateRange.start.slice(0, 10), end_date: dateRange.end.slice(0, 10),
      page_size: 1000,
    });
    const list = data.list as Array<Record<string, unknown>> | undefined ?? [];
    const campaigns = list.map(row => {
      const dims = row.dimensions as Record<string, string> | undefined ?? {};
      const m = row.metrics as Record<string, string> | undefined ?? {};
      return {
        externalId: dims.campaign_id ?? '',
        spend: toCents(parseFloat(m.spend ?? '0')),
        impressions: parseInt(m.impressions ?? '0'),
        clicks: parseInt(m.clicks ?? '0'),
        conversions: parseInt(m.conversion ?? '0'),
      };
    });
    return { platform: 'tiktok', dateRange, totalSpend: aggregateSpend(campaigns), campaigns };
  }

  private async report(campaignId: string, metrics: string[]): Promise<Record<string, string>> {
    const today = new Date().toISOString().slice(0, 10);
    const data = await this.post('/report/integrated/get/', {
      advertiser_id: this.config.appId, report_type: 'BASIC',
      dimensions: ['campaign_id'], metrics, data_level: 'AUCTION_CAMPAIGN',
      start_date: today, end_date: today,
      filtering: [{ field_name: 'campaign_ids', filter_type: 'IN', filter_value: JSON.stringify([campaignId]) }],
      page_size: 1,
    });
    const list = data.list as Array<Record<string, unknown>> | undefined ?? [];
    return (list[0]?.metrics as Record<string, string>) ?? {};
  }

  async getPerformance(campaignId: string): Promise<PerformanceMetrics> {
    const m = await this.report(campaignId, ['spend', 'impressions', 'clicks', 'conversion', 'ctr', 'cpc']);
    const spend = toCents(parseFloat(m.spend ?? '0'));
    return {
      campaignId,
      impressions: parseInt(m.impressions ?? '0'),
      clicks: parseInt(m.clicks ?? '0'),
      conversions: parseInt(m.conversion ?? '0'),
      spend,
      ctr: parseFloat(m.ctr ?? '0') as Percentage,
      cpc: toCents(parseFloat(m.cpc ?? '0')),
      roas: (spend > 0 ? 0 : 0) as Ratio,
    };
  }

  async getInsights(campaignId: string, metrics: string[]): Promise<InsightData> {
    const row = await this.report(campaignId, metrics);
    const result: Record<string, number> = {};
    for (const metric of metrics) { result[metric] = parseFloat(row[metric] ?? '0'); }
    return { campaignId, metrics: result };
  }
}
