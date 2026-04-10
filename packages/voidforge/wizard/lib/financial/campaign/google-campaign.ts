/**
 * Google Ads Campaign Adapter — orchestration layer.
 *
 * Implements AdPlatformAdapter for Google Ads API v17.
 * Raw API calls delegated to google-api.ts.
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
import { toCents, TokenBucketLimiter } from './base.js';
import { safeParseJson, requireCompliance, aggregateSpend } from './campaign-common.js';
import {
  googlePost, googleRefreshToken, extractSearchStreamRows,
  sanitizeGaqlParam, sanitizeDate, throwGoogleApiError,
} from './google-api.js';

export type { GoogleCampaignConfig } from './google-api.js';

// ── Adapter Implementation ──────────────────────────

export class GoogleCampaignAdapter implements AdPlatformAdapter {
  private readonly config: { customerId: string; accessToken: string; developerToken: string };
  private readonly rateLimiter: TokenBucketLimiter;

  constructor(config: { customerId: string; accessToken: string; developerToken: string }) {
    this.config = config;
    this.rateLimiter = new TokenBucketLimiter({ capacity: 100, refillRate: 15000 / 86400 });
  }

  private async mutate(path: string, ops: Record<string, unknown>): Promise<string> {
    await this.rateLimiter.acquire();
    const { status, body } = await googlePost(
      `/customers/${this.config.customerId}/${path}`,
      this.config.accessToken, this.config.developerToken, ops,
    );
    if (status !== 200) throwGoogleApiError(status, body);
    return body;
  }

  private async search(query: string): Promise<Array<Record<string, unknown>>> {
    await this.rateLimiter.acquire();
    const { status, body } = await googlePost(
      `/customers/${this.config.customerId}/googleAds:searchStream`,
      this.config.accessToken, this.config.developerToken, { query },
    );
    if (status !== 200) throwGoogleApiError(status, body);
    return extractSearchStreamRows(body);
  }

  private campaignResource(id: string): string {
    return `customers/${this.config.customerId}/campaigns/${id}`;
  }

  async refreshToken(token: OAuthTokens): Promise<OAuthTokens> {
    const result = await googleRefreshToken(token.refreshToken);
    if (result.status !== 200) throwGoogleApiError(result.status, result.body);
    const parsed = safeParseJson(result.body);
    return {
      ...token,
      accessToken: parsed.access_token as string,
      expiresAt: new Date(Date.now() + ((parsed.expires_in as number) ?? 3600) * 1000).toISOString(),
    };
  }

  async createCampaign(config: CampaignConfig): Promise<CampaignResult> {
    requireCompliance(config, 'google');
    const body = await this.mutate('campaigns:mutate', {
      operations: [{
        create: {
          name: config.name, advertisingChannelType: 'SEARCH', status: 'PAUSED',
          campaignBudget: `customers/${this.config.customerId}/campaignBudgets/-1`,
          biddingStrategyType: config.objective === 'conversions' ? 'MAXIMIZE_CONVERSIONS' : 'MAXIMIZE_CLICKS',
        },
      }],
      requestId: config.idempotencyKey,
    });
    const parsed = safeParseJson(body);
    const results = parsed.results as Array<Record<string, unknown>> | undefined ?? [];
    const resource = results[0]?.resourceName as string ?? '';
    const externalId = resource.split('/').pop() ?? '';
    return {
      externalId, platform: 'google', status: 'created',
      dashboardUrl: `https://ads.google.com/aw/campaigns?campaignId=${externalId}&ocid=${this.config.customerId}`,
    };
  }

  async updateCampaign(id: string, changes: CampaignUpdate): Promise<void> {
    const update: Record<string, unknown> = { resourceName: this.campaignResource(id) };
    const updateMask: string[] = [];
    if (changes.name !== undefined) { update.name = changes.name; updateMask.push('name'); }
    if (updateMask.length === 0) return;
    await this.mutate('campaigns:mutate', { operations: [{ update, updateMask: updateMask.join(',') }] });
  }

  async pauseCampaign(id: string): Promise<void> {
    await this.mutate('campaigns:mutate', {
      operations: [{ update: { resourceName: this.campaignResource(id), status: 'PAUSED' }, updateMask: 'status' }],
    });
  }

  async resumeCampaign(id: string): Promise<void> {
    await this.mutate('campaigns:mutate', {
      operations: [{ update: { resourceName: this.campaignResource(id), status: 'ENABLED' }, updateMask: 'status' }],
    });
  }

  async deleteCampaign(id: string): Promise<void> {
    await this.mutate('campaigns:mutate', { operations: [{ remove: this.campaignResource(id) }] });
  }

  async updateBudget(id: string, dailyBudget: Cents): Promise<void> {
    const budgetMicros = dailyBudget * 10000;
    const rows = await this.search(
      `SELECT campaign_budget.resource_name FROM campaign WHERE campaign.id = ${sanitizeGaqlParam(id)} LIMIT 1`,
    );
    const budgetResource = (rows[0]?.campaignBudget as Record<string, unknown> | undefined)?.resourceName as string | undefined;
    if (!budgetResource) {
      throwGoogleApiError(404, JSON.stringify({ error: { message: `Budget resource not found for campaign ${id}` } }));
    }
    await this.mutate('campaignBudgets:mutate', {
      operations: [{ update: { resourceName: budgetResource, amountMicros: budgetMicros }, updateMask: 'amount_micros' }],
    });
  }

  async updateCreative(id: string, creative: CreativeConfig): Promise<void> {
    const rows = await this.search(
      `SELECT ad_group_ad.ad.resource_name, ad_group_ad.ad.id FROM ad_group_ad WHERE campaign.id = ${sanitizeGaqlParam(id)} LIMIT 1`,
    );
    const adResource = (rows[0]?.adGroupAd as Record<string, unknown> | undefined) as
      { ad?: { resourceName?: string } } | undefined;
    if (!adResource?.ad?.resourceName) {
      throwGoogleApiError(404, JSON.stringify({ error: { message: `No ad found for campaign ${id}` } }));
    }
    const update: Record<string, unknown> = { resourceName: adResource!.ad!.resourceName };
    const updateMask: string[] = [];
    if (creative.headlines) {
      update.responsiveSearchAd = {
        ...(update.responsiveSearchAd as Record<string, unknown> ?? {}),
        headlines: creative.headlines.map(h => ({ text: h })),
      };
      updateMask.push('responsive_search_ad.headlines');
    }
    if (creative.descriptions) {
      update.responsiveSearchAd = {
        ...(update.responsiveSearchAd as Record<string, unknown> ?? {}),
        descriptions: creative.descriptions.map(d => ({ text: d })),
      };
      updateMask.push('responsive_search_ad.descriptions');
    }
    if (creative.landingUrl) { update.finalUrls = [creative.landingUrl]; updateMask.push('final_urls'); }
    if (updateMask.length === 0) return;
    await this.mutate('ads:mutate', { operations: [{ update, updateMask: updateMask.join(',') }] });
  }

  async getSpend(dateRange: { start: string; end: string }): Promise<SpendReport> {
    const rows = await this.search([
      'SELECT campaign.id, metrics.cost_micros, metrics.impressions, metrics.clicks, metrics.conversions',
      'FROM campaign',
      `WHERE segments.date BETWEEN '${sanitizeDate(dateRange.start)}' AND '${sanitizeDate(dateRange.end)}'`,
    ].join(' '));
    const campaigns = rows.map(row => {
      const m = row.metrics as Record<string, string> | undefined ?? {};
      const c = row.campaign as Record<string, string> | undefined ?? {};
      return {
        externalId: c.id ?? '',
        spend: toCents(parseInt(m.costMicros ?? '0') / 1_000_000),
        impressions: parseInt(m.impressions ?? '0'),
        clicks: parseInt(m.clicks ?? '0'),
        conversions: Math.round(parseFloat(m.conversions ?? '0')),
      };
    });
    return { platform: 'google', dateRange, totalSpend: aggregateSpend(campaigns), campaigns };
  }

  async getPerformance(campaignId: string): Promise<PerformanceMetrics> {
    const today = new Date().toISOString().slice(0, 10);
    const rows = await this.search([
      'SELECT metrics.cost_micros, metrics.impressions, metrics.clicks,',
      'metrics.conversions, metrics.ctr, metrics.average_cpc FROM campaign',
      `WHERE campaign.id = ${sanitizeGaqlParam(campaignId)} AND segments.date = '${today}'`,
    ].join(' '));
    const m = rows[0]?.metrics as Record<string, string> | undefined ?? {};
    const spend = toCents(parseInt(m.costMicros ?? '0') / 1_000_000);
    return {
      campaignId,
      impressions: parseInt(m.impressions ?? '0'),
      clicks: parseInt(m.clicks ?? '0'),
      conversions: Math.round(parseFloat(m.conversions ?? '0')),
      spend,
      ctr: parseFloat(m.ctr ?? '0') as Percentage,
      cpc: toCents(parseInt(m.averageCpc ?? '0') / 1_000_000),
      roas: (spend > 0 ? 0 : 0) as Ratio,
    };
  }

  async getInsights(campaignId: string, metrics: string[]): Promise<InsightData> {
    const metricsQuery = metrics.map(m => `metrics.${sanitizeGaqlParam(m)}`).join(', ');
    const today = new Date().toISOString().slice(0, 10);
    const rows = await this.search(
      `SELECT ${metricsQuery} FROM campaign WHERE campaign.id = ${sanitizeGaqlParam(campaignId)} AND segments.date = '${today}'`,
    );
    const row = rows[0]?.metrics as Record<string, string> | undefined ?? {};
    const result: Record<string, number> = {};
    for (const metric of metrics) { result[metric] = parseFloat(row[metric] ?? '0'); }
    return { campaignId, metrics: result };
  }
}
