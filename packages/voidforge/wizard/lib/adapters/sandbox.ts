/**
 * Sandbox Ad Platform Adapter — full implementation for development/demo.
 *
 * Returns realistic fake data matching the AdPlatformSetup + AdPlatformAdapter
 * interfaces. Every method returns valid-shaped data. No throws.
 * This IS a full implementation for a sandbox platform (No Stubs Doctrine, v17.0).
 *
 * Use case: demonstrates the full Cultivation pipeline end-to-end without
 * real platform API credentials. Users can see data flowing through dashboards,
 * heartbeat daemon running real jobs, reconciliation processing, circuit breakers firing.
 */

import { randomUUID } from 'node:crypto';
import type {
  AdPlatformSetup, AdPlatformAdapter, OAuthTokens, ConnectionStatus,
  CampaignConfig, CampaignResult, CampaignUpdate, CreativeConfig,
  SpendReport, PerformanceMetrics, InsightData, Cents, Percentage, Ratio,
} from './types.js';
import { toCents } from './types.js';

/** Campaign state shape for the in-memory sandbox store. */
interface SandboxCampaignState {
  id: string;
  name: string;
  status: 'active' | 'paused' | 'deleted';
  dailyBudgetCents: number;
  createdAt: string;
  totalSpendCents: number;
  impressions: number;
  clicks: number;
  conversions: number;
}

export class SandboxSetup implements AdPlatformSetup {
  constructor(private label: string = 'Sandbox') {}

  async authenticate(): Promise<OAuthTokens> {
    return {
      accessToken: `sandbox_access_${randomUUID().slice(0, 8)}`,
      refreshToken: `sandbox_refresh_${randomUUID().slice(0, 8)}`,
      expiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString(),
      platform: 'meta',
      scopes: ['ads_management', 'ads_read'],
    };
  }

  async verifyConnection(tokens: OAuthTokens): Promise<ConnectionStatus> {
    return {
      connected: true,
      accountName: `${this.label} Demo Account`,
      accountId: 'sandbox_' + randomUUID().slice(0, 8),
      currency: 'USD',
    };
  }

  async detectCurrency(_tokens: OAuthTokens): Promise<string> {
    return 'USD';
  }
}

export class SandboxAdapter implements AdPlatformAdapter {
  // Instance-level campaign store — prevents state leaks between test runs and adapter instances
  private campaigns = new Map<string, SandboxCampaignState>();

  constructor(private accountId: string = 'sandbox', private tokens: OAuthTokens = { accessToken: '', refreshToken: '', expiresAt: '', platform: 'meta', scopes: [] }) {}

  async refreshToken(token: OAuthTokens): Promise<OAuthTokens> {
    return {
      ...token,
      accessToken: `sandbox_access_${randomUUID().slice(0, 8)}`,
      expiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString(),
    };
  }

  async createCampaign(config: CampaignConfig): Promise<CampaignResult> {
    const id = `sandbox_camp_${randomUUID().slice(0, 12)}`;
    this.campaigns.set(id, {
      id,
      name: config.name,
      status: 'paused',
      dailyBudgetCents: (config.dailyBudget as number) ?? 1000,
      createdAt: new Date().toISOString(),
      totalSpendCents: 0,
      impressions: 0,
      clicks: 0,
      conversions: 0,
    });
    return {
      externalId: id,
      platform: config.platform ?? 'meta',
      status: 'created',
      dashboardUrl: `https://sandbox.voidforge.dev/campaigns/${id}`,
    };
  }

  async updateCampaign(id: string, changes: CampaignUpdate): Promise<void> {
    const camp = this.campaigns.get(id);
    if (camp) {
      if (changes.name) camp.name = changes.name;
      if (changes.dailyBudget) camp.dailyBudgetCents = changes.dailyBudget as number;
    }
  }

  async pauseCampaign(id: string): Promise<void> {
    const camp = this.campaigns.get(id);
    if (camp) camp.status = 'paused';
  }

  async resumeCampaign(id: string): Promise<void> {
    const camp = this.campaigns.get(id);
    if (camp) camp.status = 'active';
  }

  async deleteCampaign(id: string): Promise<void> {
    const camp = this.campaigns.get(id);
    if (camp) camp.status = 'deleted';
  }

  async updateBudget(id: string, dailyBudget: Cents): Promise<void> {
    const camp = this.campaigns.get(id);
    if (camp) camp.dailyBudgetCents = dailyBudget as number;
  }

  async updateCreative(_id: string, _creative: CreativeConfig): Promise<void> {
    // Sandbox accepts any creative update
  }

  async getSpend(dateRange: { start: string; end: string }): Promise<SpendReport> {
    // Generate realistic spend data based on active campaigns
    const activeCampaigns = [...this.campaigns.values()].filter(c => c.status === 'active');
    const dayCount = Math.ceil(
      (new Date(dateRange.end).getTime() - new Date(dateRange.start).getTime()) / (24 * 60 * 60 * 1000)
    );

    // Invalid date range (end before start) — return empty result
    if (dayCount <= 0) {
      return {
        platform: 'meta',
        dateRange,
        totalSpend: toCents(0),
        campaigns: [],
      };
    }

    const campaignSpend = activeCampaigns.map(c => {
      // Simulate realistic daily spend (~70-95% of budget)
      const spendFactor = 0.7 + Math.random() * 0.25;
      const dailySpend = Math.round(c.dailyBudgetCents * spendFactor);
      const totalCampaignSpend = dailySpend * dayCount;
      c.totalSpendCents += totalCampaignSpend;
      c.impressions += Math.round(totalCampaignSpend / 2); // ~$0.02 CPM
      c.clicks += Math.round(c.impressions * (0.01 + Math.random() * 0.03)); // 1-4% CTR
      c.conversions += Math.round(c.clicks * (0.02 + Math.random() * 0.05)); // 2-7% CVR

      return {
        externalId: c.id,
        spend: toCents(totalCampaignSpend / 100),
        impressions: c.impressions,
        clicks: c.clicks,
        conversions: c.conversions,
      };
    });

    const totalSpendValue = campaignSpend.reduce((sum, c) => sum + (c.spend as number), 0);
    return {
      platform: 'meta',
      dateRange,
      totalSpend: toCents(totalSpendValue / 100),
      campaigns: campaignSpend,
    };
  }

  async getPerformance(campaignId: string): Promise<PerformanceMetrics> {
    const camp = this.campaigns.get(campaignId);
    const impressions = camp?.impressions ?? Math.round(1000 + Math.random() * 9000);
    const clicks = camp?.clicks ?? Math.round(impressions * 0.025);
    const conversions = camp?.conversions ?? Math.round(clicks * 0.04);
    const spendCentsRaw = camp?.totalSpendCents ?? Math.round(impressions * 2);

    return {
      campaignId,
      impressions,
      clicks,
      conversions,
      spend: toCents(spendCentsRaw / 100),
      ctr: (clicks / Math.max(impressions, 1)) as Percentage,
      cpc: toCents((spendCentsRaw / Math.max(clicks, 1)) / 100),
      roas: (conversions > 0 ? (conversions * 5000) / Math.max(spendCentsRaw, 1) : 0) as Ratio,
    };
  }

  async getInsights(campaignId: string, metrics: string[]): Promise<InsightData> {
    const perf = await this.getPerformance(campaignId);
    const data: Record<string, number> = {};
    for (const metric of metrics) {
      if (metric in perf) data[metric] = (perf as unknown as Record<string, number>)[metric];
      else data[metric] = 0;
    }
    return { campaignId, metrics: data };
  }
}
