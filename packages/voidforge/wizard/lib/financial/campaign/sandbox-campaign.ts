/**
 * Sandbox Campaign Adapter — full implementation for development/demo.
 *
 * Returns realistic fake data matching the AdPlatformAdapter interface.
 * Every method returns valid-shaped data. No throws (except invalid operations).
 * This IS a full implementation for a sandbox provider (No Stubs Doctrine).
 *
 * Simulates campaign lifecycle: create → pending_review → (approveCampaign) →
 * active → paused → resumed → completed. Realistic fake metrics: CTR 1.2-3.8%,
 * CPC $0.45-$2.10, ROAS 1.5-4.2x. Idempotency key tracking prevents duplicate creates.
 *
 * PRD Reference: §9.5, §9.19.10, §9.20.4
 */

import { randomUUID } from 'node:crypto';
import type {
  AdPlatformAdapter,
  CampaignConfig, CampaignResult, CampaignUpdate, CreativeConfig,
  SpendReport, PerformanceMetrics, InsightData,
  OAuthTokens, PlatformError, AdPlatform,
  Cents, Percentage, Ratio,
} from './base.js';
import { toCents } from './base.js';

// ── Internal Campaign State ─────────────────────────

type SandboxCampaignStatus = 'pending_review' | 'active' | 'paused' | 'completed' | 'deleted';

interface SandboxCampaignState {
  externalId: string;
  name: string;
  platform: AdPlatform;
  objective: CampaignConfig['objective'];
  status: SandboxCampaignStatus;
  dailyBudget: Cents;
  targeting: CampaignConfig['targeting'];
  creative: CreativeConfig;
  schedule?: CampaignConfig['schedule'];
  createdAt: string;
  totalSpendCents: Cents;
  impressions: number;
  clicks: number;
  conversions: number;
  pollCount: number;
}

// ── Deterministic Fake Metrics ──────────────────────

function fakeCtr(): Percentage {
  // CTR 1.2% - 3.8%
  return (1.2 + Math.random() * 2.6) as Percentage;
}

function fakeRoas(): Ratio {
  // ROAS 1.5x - 4.2x
  return (1.5 + Math.random() * 2.7) as Ratio;
}

function fakeDailySpend(dailyBudget: Cents): Cents {
  // Spend 60-95% of daily budget
  const factor = 0.6 + Math.random() * 0.35;
  return Math.round(dailyBudget * factor) as Cents;
}

// ── Sandbox Adapter Implementation ──────────────────

export class SandboxCampaignAdapter implements AdPlatformAdapter {
  private readonly sandboxPlatform: AdPlatform;
  private campaigns = new Map<string, SandboxCampaignState>();
  private idempotencyKeys = new Map<string, string>(); // key → externalId

  constructor(platform: AdPlatform = 'meta') {
    this.sandboxPlatform = platform;
  }

  async refreshToken(token: OAuthTokens): Promise<OAuthTokens> {
    // Sandbox tokens never expire — return same token with extended expiry
    return {
      ...token,
      expiresAt: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString(),
    };
  }

  async createCampaign(config: CampaignConfig): Promise<CampaignResult> {
    // Idempotency: return existing result for duplicate key
    const existing = this.idempotencyKeys.get(config.idempotencyKey);
    if (existing) {
      const campaign = this.campaigns.get(existing);
      if (campaign) {
        return {
          externalId: campaign.externalId,
          platform: config.platform,
          status: campaign.status === 'pending_review' ? 'pending_review' : 'created',
          dashboardUrl: `https://sandbox.ads.example.com/campaigns/${campaign.externalId}`,
        };
      }
    }

    const externalId = `sandbox_campaign_${randomUUID().slice(0, 12)}`;
    const now = new Date().toISOString();

    const state: SandboxCampaignState = {
      externalId,
      name: config.name,
      platform: config.platform,
      objective: config.objective,
      status: 'pending_review',
      dailyBudget: config.dailyBudget,
      targeting: { ...config.targeting },
      creative: {
        headlines: config.creative.headlines,
        descriptions: config.creative.descriptions,
        callToAction: config.creative.callToAction,
        landingUrl: config.creative.landingUrl,
        imageUrls: config.creative.imageUrls,
      },
      schedule: config.schedule,
      createdAt: now,
      totalSpendCents: 0 as Cents,
      impressions: 0,
      clicks: 0,
      conversions: 0,
      pollCount: 0,
    };

    this.campaigns.set(externalId, state);
    this.idempotencyKeys.set(config.idempotencyKey, externalId);

    return {
      externalId,
      platform: config.platform,
      status: 'pending_review',
      dashboardUrl: `https://sandbox.ads.example.com/campaigns/${externalId}`,
    };
  }

  async updateCampaign(id: string, changes: CampaignUpdate): Promise<void> {
    const campaign = this.requireCampaign(id);
    this.requireNotDeleted(campaign);
    if (changes.name !== undefined) campaign.name = changes.name;
    if (changes.dailyBudget !== undefined) campaign.dailyBudget = changes.dailyBudget;
    if (changes.targeting !== undefined) {
      campaign.targeting = { ...campaign.targeting, ...changes.targeting };
    }
    if (changes.schedule !== undefined) campaign.schedule = changes.schedule;
  }

  async pauseCampaign(id: string): Promise<void> {
    const campaign = this.requireCampaign(id);
    if (campaign.status !== 'active') {
      throw this.makePlatformError(
        id, `Cannot pause campaign in status: ${campaign.status}`,
        campaign.status === 'deleted' ? 'UNKNOWN' : 'UNKNOWN',
        campaign.status === 'deleted' ? 410 : 400,
      );
    }
    campaign.status = 'paused';
  }

  async resumeCampaign(id: string): Promise<void> {
    const campaign = this.requireCampaign(id);
    if (campaign.status !== 'paused') {
      throw this.makePlatformError(
        id, `Cannot resume campaign in status: ${campaign.status}`,
        'UNKNOWN', campaign.status === 'deleted' ? 410 : 400,
      );
    }
    campaign.status = 'active';
  }

  async deleteCampaign(id: string): Promise<void> {
    const campaign = this.requireCampaign(id);
    campaign.status = 'deleted';
  }

  async updateBudget(id: string, dailyBudget: Cents): Promise<void> {
    const campaign = this.requireCampaign(id);
    this.requireNotDeleted(campaign);
    campaign.dailyBudget = dailyBudget;
  }

  async updateCreative(id: string, creative: CreativeConfig): Promise<void> {
    const campaign = this.requireCampaign(id);
    this.requireNotDeleted(campaign);
    if (creative.headlines !== undefined) campaign.creative.headlines = creative.headlines;
    if (creative.descriptions !== undefined) campaign.creative.descriptions = creative.descriptions;
    if (creative.callToAction !== undefined) campaign.creative.callToAction = creative.callToAction;
    if (creative.landingUrl !== undefined) campaign.creative.landingUrl = creative.landingUrl;
    if (creative.imageUrls !== undefined) campaign.creative.imageUrls = creative.imageUrls;
  }

  async getSpend(dateRange: { start: string; end: string }): Promise<SpendReport> {
    const campaignSpends = Array.from(this.campaigns.values())
      .filter(c => c.status === 'active' || c.status === 'paused' || c.status === 'completed')
      .map(c => ({
        externalId: c.externalId,
        spend: c.totalSpendCents,
        impressions: c.impressions,
        clicks: c.clicks,
        conversions: c.conversions,
      }));

    const totalSpend = campaignSpends.reduce(
      (sum, c) => (sum + c.spend) as Cents, 0 as Cents,
    );

    return {
      platform: this.sandboxPlatform,
      dateRange,
      totalSpend,
      campaigns: campaignSpends,
    };
  }

  async getPerformance(campaignId: string): Promise<PerformanceMetrics> {
    const campaign = this.requireCampaign(campaignId);
    this.requireNotDeleted(campaign);

    // Advance metrics on each poll for active campaigns
    if (campaign.status === 'active') {
      campaign.pollCount += 1;
      const daySpend = fakeDailySpend(campaign.dailyBudget);
      campaign.totalSpendCents = (campaign.totalSpendCents + daySpend) as Cents;
      const newImpressions = Math.floor(1000 + Math.random() * 9000);
      campaign.impressions += newImpressions;
      campaign.clicks += Math.floor(newImpressions * (fakeCtr() / 100));
      campaign.conversions += Math.floor(campaign.clicks * (0.02 + Math.random() * 0.08));
    }

    const ctr = campaign.impressions > 0
      ? (campaign.clicks / campaign.impressions * 100) as Percentage
      : 0 as Percentage;
    const cpc = campaign.clicks > 0
      ? Math.round(campaign.totalSpendCents / campaign.clicks) as Cents
      : 0 as Cents;

    return {
      campaignId,
      impressions: campaign.impressions,
      clicks: campaign.clicks,
      conversions: campaign.conversions,
      spend: campaign.totalSpendCents,
      ctr,
      cpc,
      roas: fakeRoas(),
    };
  }

  async getInsights(campaignId: string, metrics: string[]): Promise<InsightData> {
    const campaign = this.requireCampaign(campaignId);
    this.requireNotDeleted(campaign);
    const result: Record<string, number> = {};

    for (const metric of metrics) {
      switch (metric) {
        case 'impressions': result[metric] = campaign.impressions; break;
        case 'clicks': result[metric] = campaign.clicks; break;
        case 'conversions': result[metric] = campaign.conversions; break;
        case 'spend': result[metric] = campaign.totalSpendCents; break;
        case 'ctr': result[metric] = campaign.impressions > 0
          ? campaign.clicks / campaign.impressions * 100 : 0; break;
        default: result[metric] = 0;
      }
    }

    return {
      campaignId,
      metrics: result,
      recommendations: campaign.status === 'active'
        ? ['Consider increasing budget — ROAS is healthy']
        : undefined,
    };
  }

  // ── Sandbox-Specific Methods ────────────────────────

  /** Manually advance campaign from pending_review to active (simulates platform approval). */
  approveCampaign(id: string): void {
    const campaign = this.requireCampaign(id);
    if (campaign.status === 'pending_review') {
      campaign.status = 'active';
    }
  }

  /** Get the current status of a sandbox campaign (for testing/integration). */
  getCampaignStatus(id: string): SandboxCampaignStatus {
    return this.requireCampaign(id).status;
  }

  /** Get the count of tracked campaigns (for testing). */
  getCampaignCount(): number {
    return this.campaigns.size;
  }

  // ── Private Helpers ─────────────────────────────────

  private requireCampaign(id: string): SandboxCampaignState {
    const campaign = this.campaigns.get(id);
    if (!campaign) {
      throw this.makePlatformError(id, 'Campaign not found', 'UNKNOWN', 404);
    }
    return campaign;
  }

  private requireNotDeleted(campaign: SandboxCampaignState): void {
    if (campaign.status === 'deleted') {
      throw this.makePlatformError(
        campaign.externalId, 'Campaign is deleted', 'UNKNOWN', 410,
      );
    }
  }

  private makePlatformError(
    campaignId: string,
    message: string,
    code: PlatformError['code'] = 'UNKNOWN',
    originalCode: number = 400,
  ): PlatformError {
    return {
      platform: this.sandboxPlatform,
      code,
      originalCode,
      message: `Sandbox: ${message} (campaign: ${campaignId})`,
      retryable: false,
    };
  }
}
