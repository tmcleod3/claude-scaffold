/**
 * Meta Marketing Campaign Adapter — real implementation via node:https (zero new dependencies).
 *
 * Implements AdPlatformAdapter for Meta Marketing API v19.0.
 *
 * Meta Marketing API v19.0:
 *   Base URL: https://graph.facebook.com/v19.0
 *   Auth: access_token query parameter
 *   Campaign CRUD via Graph API
 *   Reporting via insights endpoint
 *   Rate limit: 200 calls/hr/ad account (sliding window)
 *
 * PRD Reference: §9.5, §9.19.10, §9.20.4
 * No Stubs Doctrine: every method makes a real API call or returns documented empty.
 */

import { request as httpsRequest } from 'node:https';
import type {
  AdPlatformAdapter,
  CampaignConfig, CampaignResult, CampaignUpdate, CreativeConfig,
  SpendReport, PerformanceMetrics, InsightData,
  OAuthTokens, PlatformError,
  Cents, Percentage, Ratio,
} from './base.js';
import { toCents, TokenBucketLimiter } from './base.js';

const META_HOST = 'graph.facebook.com';

// ── Config ──────────────────────────────────────────

interface MetaCampaignConfig {
  adAccountId: string;
  accessToken: string;
}

// ── HTTP helpers ─────────────────────────────────────

async function metaGet(
  path: string,
  accessToken: string,
  params?: Record<string, string>,
): Promise<{ status: number; body: string }> {
  const queryParams = new URLSearchParams({ access_token: accessToken, ...params });
  const query = '?' + queryParams.toString();
  return new Promise((resolve, reject) => {
    const req = httpsRequest({
      hostname: META_HOST,
      path: `/v19.0${path}${query}`,
      method: 'GET',
      headers: { 'Accept': 'application/json' },
      timeout: 15000,
    }, (res) => {
      let data = '';
      res.on('data', (chunk: Buffer) => { data += chunk.toString(); });
      res.on('end', () => resolve({ status: res.statusCode ?? 500, body: data }));
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Meta API timeout')); });
    req.end();
  });
}

async function metaPost(
  path: string,
  accessToken: string,
  params: Record<string, string>,
): Promise<{ status: number; body: string }> {
  const payload = new URLSearchParams({ access_token: accessToken, ...params }).toString();
  return new Promise((resolve, reject) => {
    const req = httpsRequest({
      hostname: META_HOST,
      path: `/v19.0${path}`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json',
      },
      timeout: 15000,
    }, (res) => {
      let data = '';
      res.on('data', (chunk: Buffer) => { data += chunk.toString(); });
      res.on('end', () => resolve({ status: res.statusCode ?? 500, body: data }));
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Meta API timeout')); });
    req.write(payload);
    req.end();
  });
}

async function metaDelete(
  path: string,
  accessToken: string,
): Promise<{ status: number; body: string }> {
  const query = `?access_token=${encodeURIComponent(accessToken)}`;
  return new Promise((resolve, reject) => {
    const req = httpsRequest({
      hostname: META_HOST,
      path: `/v19.0${path}${query}`,
      method: 'DELETE',
      headers: { 'Accept': 'application/json' },
      timeout: 15000,
    }, (res) => {
      let data = '';
      res.on('data', (chunk: Buffer) => { data += chunk.toString(); });
      res.on('end', () => resolve({ status: res.statusCode ?? 500, body: data }));
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Meta API timeout')); });
    req.end();
  });
}

function safeParseJson(body: string): Record<string, unknown> {
  try {
    return JSON.parse(body) as Record<string, unknown>;
  } catch {
    return { error: { message: 'Non-JSON response from Meta API' } };
  }
}

function makePlatformError(
  code: PlatformError['code'],
  originalCode: number,
  message: string,
  retryable: boolean = false,
  retryAfter?: number,
): PlatformError {
  return { platform: 'meta', code, originalCode, message, retryable, retryAfter };
}

function mapObjective(obj: CampaignConfig['objective']): string {
  const map = {
    awareness: 'OUTCOME_AWARENESS',
    traffic: 'OUTCOME_TRAFFIC',
    conversions: 'OUTCOME_SALES',
  };
  return map[obj];
}

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
      throw makePlatformError('AUTH_EXPIRED', status, 'Meta token refresh failed');
    }

    const parsed = safeParseJson(body);
    return {
      ...token,
      accessToken: parsed.access_token as string,
      expiresAt: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString(),
    };
  }

  async createCampaign(config: CampaignConfig): Promise<CampaignResult> {
    if (config.complianceStatus !== 'passed') {
      throw makePlatformError('UNKNOWN', 400, 'Campaign compliance not passed — cannot create');
    }

    await this.rateLimiter.acquire();
    const { status, body } = await metaPost(
      `/act_${this.config.adAccountId}/campaigns`,
      this.config.accessToken,
      {
        name: config.name,
        objective: mapObjective(config.objective),
        status: 'PAUSED',
        special_ad_categories: '[]',
        // Idempotency per ADR-3: Meta uses request-level dedup via the key
        idempotency_key: config.idempotencyKey,
      },
    );

    if (status !== 200) {
      this.throwApiError(status, body);
    }

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
    if (status !== 200) {
      this.throwApiError(status, body);
    }
  }

  async pauseCampaign(id: string): Promise<void> {
    await this.rateLimiter.acquire();
    const { status, body } = await metaPost(`/${id}`, this.config.accessToken, {
      status: 'PAUSED',
    });
    if (status !== 200) {
      this.throwApiError(status, body);
    }
  }

  async resumeCampaign(id: string): Promise<void> {
    await this.rateLimiter.acquire();
    const { status, body } = await metaPost(`/${id}`, this.config.accessToken, {
      status: 'ACTIVE',
    });
    if (status !== 200) {
      this.throwApiError(status, body);
    }
  }

  async deleteCampaign(id: string): Promise<void> {
    await this.rateLimiter.acquire();
    const { status, body } = await metaDelete(`/${id}`, this.config.accessToken);
    if (status !== 200) {
      this.throwApiError(status, body);
    }
  }

  async updateBudget(id: string, dailyBudget: Cents): Promise<void> {
    await this.rateLimiter.acquire();
    // Meta budgets are in the account's currency smallest unit (cents for USD)
    const { status, body } = await metaPost(`/${id}`, this.config.accessToken, {
      daily_budget: String(dailyBudget),
    });
    if (status !== 200) {
      this.throwApiError(status, body);
    }
  }

  async updateCreative(id: string, creative: CreativeConfig): Promise<void> {
    await this.rateLimiter.acquire();
    // Meta creative updates go through the ad object, not campaign
    // Query the first ad under this campaign, then update it
    const { status: queryStatus, body: queryBody } = await metaGet(
      `/${id}/ads`,
      this.config.accessToken,
      { fields: 'id', limit: '1' },
    );

    if (queryStatus !== 200) {
      this.throwApiError(queryStatus, queryBody);
    }

    const queryParsed = safeParseJson(queryBody);
    const ads = queryParsed.data as Array<Record<string, string>> | undefined ?? [];

    if (ads.length === 0) {
      throw makePlatformError('CREATIVE_REJECTED', 404, `No ads found for campaign ${id}`);
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
    if (status !== 200) {
      this.throwApiError(status, body);
    }
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

    if (status !== 200) {
      this.throwApiError(status, body);
    }

    const parsed = safeParseJson(body);
    const dataArray = parsed.data as Array<Record<string, string>> | undefined ?? [];

    const campaigns = dataArray.map(r => ({
      externalId: r.campaign_id,
      spend: toCents(parseFloat(r.spend)),
      impressions: parseInt(r.impressions),
      clicks: parseInt(r.clicks),
      conversions: parseInt(r.conversions || '0'),
    }));

    const totalSpend = campaigns.reduce(
      (sum, c) => (sum + c.spend) as Cents, 0 as Cents,
    );

    return { platform: 'meta', dateRange, totalSpend, campaigns };
  }

  async getPerformance(campaignId: string): Promise<PerformanceMetrics> {
    await this.rateLimiter.acquire();
    const { status, body } = await metaGet(
      `/${campaignId}/insights`,
      this.config.accessToken,
      { fields: 'impressions,clicks,conversions,spend,ctr,cpc' },
    );

    if (status !== 200) {
      this.throwApiError(status, body);
    }

    const parsed = safeParseJson(body);
    const dataArray = parsed.data as Array<Record<string, string>> | undefined ?? [];
    const d = dataArray[0] ?? {};
    const spend = toCents(parseFloat(d.spend ?? '0'));
    const conversions = parseInt(d.conversions || '0');

    return {
      campaignId,
      impressions: parseInt(d.impressions ?? '0'),
      clicks: parseInt(d.clicks ?? '0'),
      conversions,
      spend,
      ctr: parseFloat(d.ctr ?? '0') as Percentage,
      cpc: toCents(parseFloat(d.cpc ?? '0')),
      roas: (spend > 0 ? 0 : 0) as Ratio, // Revenue from Stripe, not ad platform
    };
  }

  async getInsights(campaignId: string, metrics: string[]): Promise<InsightData> {
    await this.rateLimiter.acquire();
    const { status, body } = await metaGet(
      `/${campaignId}/insights`,
      this.config.accessToken,
      { fields: metrics.join(',') },
    );

    if (status !== 200) {
      this.throwApiError(status, body);
    }

    const parsed = safeParseJson(body);
    const dataArray = parsed.data as Array<Record<string, string>> | undefined ?? [];
    const row = dataArray[0] ?? {};

    const result: Record<string, number> = {};
    for (const metric of metrics) {
      result[metric] = parseFloat(row[metric] ?? '0');
    }

    return { campaignId, metrics: result };
  }

  // ── Private helpers ─────────────────────────────────

  private throwApiError(status: number, body: string): never {
    const parsed = safeParseJson(body);
    const errObj = parsed.error as Record<string, unknown> | undefined;
    const errMsg = errObj?.message as string ?? `HTTP ${status}`;
    const errCode = errObj?.code as number | undefined;

    if (status === 429 || errCode === 32 || errCode === 4) {
      throw makePlatformError('RATE_LIMITED', status, errMsg, true, 60);
    }
    if (status === 401 || status === 403 || errCode === 190) {
      throw makePlatformError('AUTH_EXPIRED', status, errMsg);
    }
    if (errCode === 2635005 || errMsg.toLowerCase().includes('budget')) {
      throw makePlatformError('BUDGET_EXCEEDED', status, errMsg);
    }
    throw makePlatformError('UNKNOWN', status, errMsg);
  }
}
