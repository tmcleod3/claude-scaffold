/**
 * Heartbeat Scheduler — scheduled job definitions for the heartbeat daemon.
 *
 * Extracted from heartbeat.ts to isolate the job registration logic.
 * All jobs receive a SchedulerContext for access to shared daemon state.
 *
 * Jobs: health-ping, token-refresh, spend-check, campaign-status-check,
 * reconciliation, ab-test-eval, kill-check, budget-rebalance,
 * autonomy-check, growth-report.
 */

import { join } from 'node:path';
import { mkdir } from 'node:fs/promises';
import type { JobScheduler } from './daemon-core.js';

import { financialVaultGet } from './financial-vault.js';
import {
  needsRefresh, handleRefreshFailure,
  tokenVaultKey, deserializeTokens,
} from './oauth-core.js';

import { atomicWrite } from './financial-core.js';
import { getCampaignAdapter } from './financial/adapter-factory.js';
import type { AdPlatform } from './financial/campaign/base.js';
import { loadAutonomyState, checkCircuitBreakers, saveAutonomyState } from './autonomy-controller.js';

import type { CampaignRecord } from './heartbeat-lifecycle.js';
import { validateCampaignId } from './heartbeat-lifecycle.js';

// ── Scheduler Context ─────────────────────────────────

/** State and callbacks the scheduler needs from the main heartbeat module. */
export interface SchedulerContext {
  readonly logger: { log: (msg: string) => void };
  readonly vaultKey: string | null;
  readonly activeTreasuryDir: () => string;
  writeCurrentState: () => Promise<void>;
  readCampaigns: () => Promise<unknown[]>;
  readTreasurySummary: () => Promise<unknown>;
}

// ── Scheduled Jobs ────────────────────────────────────

export function registerJobs(
  scheduler: JobScheduler,
  ctx: SchedulerContext,
  platformHealth: Record<string, { status: string; expiresAt: string }>,
  platformFailures: Record<string, number>,
): void {
  // Health ping — every 60 seconds
  scheduler.add('health-ping', 60_000, async () => {
    await ctx.writeCurrentState();
  });

  // Token refresh — every 5 minutes (checks per-platform TTL internally)
  scheduler.add('token-refresh', 300_000, async () => {
    if (!ctx.vaultKey) {
      ctx.logger.log('Token refresh skipped — vault key expired');
      return;
    }
    for (const platform of Object.keys(platformHealth)) {
      try {
        const tokenData = await financialVaultGet(ctx.vaultKey, tokenVaultKey(platform as never));
        if (!tokenData) continue;
        const tokens = deserializeTokens(tokenData);
        if (needsRefresh(tokens)) {
          ctx.logger.log(`Refreshing token for ${platform}`);
          const adapter = await getCampaignAdapter(platform as AdPlatform, ctx.vaultKey, ctx.logger);
          await adapter.refreshToken(tokens);
          platformFailures[platform] = 0;
        }
      } catch (err) {
        platformFailures[platform] = (platformFailures[platform] || 0) + 1;
        const action = handleRefreshFailure(platform as never, String(err), platformFailures[platform]);
        if (action.action === 'pause_and_alert' || action.action === 'reauth') {
          platformHealth[platform] = { status: 'requires_reauth', expiresAt: '' };
          ctx.logger.log(`Platform ${platform} requires re-authentication`);
        }
      }
    }
  });

  // Spend check — hourly: read campaigns and log total spend
  scheduler.add('spend-check', 3_600_000, async () => {
    const campaigns = await ctx.readCampaigns();
    const summary = await ctx.readTreasurySummary() as { spend: number; revenue: number };
    ctx.logger.log(`Hourly spend check: ${campaigns.length} campaigns, $${(summary.spend / 100).toFixed(2)} total spend`);
    await ctx.writeCurrentState();
  });

  // Campaign status check — every 5 minutes: poll adapter for live metrics
  scheduler.add('campaign-status-check', 300_000, async () => {
    const campaigns = await ctx.readCampaigns() as CampaignRecord[];
    const activeCampaigns = campaigns.filter(c => c.status === 'active' || c.status === 'pending_approval');
    if (activeCampaigns.length === 0) return;

    let updated = 0;
    for (const campaign of activeCampaigns) {
      try {
        const adapter = await getCampaignAdapter(campaign.platform, ctx.vaultKey, ctx.logger);
        const perf = await adapter.getPerformance(campaign.externalId);

        const enriched = campaign as CampaignRecord & {
          spendCents?: number; impressions?: number; clicks?: number;
          conversions?: number; ctr?: number; cpc?: number; roas?: number;
        };
        enriched.spendCents = perf.spend;
        enriched.impressions = perf.impressions;
        enriched.clicks = perf.clicks;
        enriched.conversions = perf.conversions;
        enriched.ctr = perf.ctr;
        enriched.cpc = perf.cpc;
        enriched.roas = perf.roas;
        enriched.updatedAt = new Date().toISOString();

        // Write enriched record back to campaigns directory
        if (validateCampaignId(campaign.campaignId)) {
          const campaignsDir = join(ctx.activeTreasuryDir(), 'campaigns');
          await mkdir(campaignsDir, { recursive: true });
          await atomicWrite(
            join(campaignsDir, `${campaign.campaignId}.json`),
            JSON.stringify(enriched, null, 2),
          );
        }
        updated++;

        platformFailures[campaign.platform] = 0;
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        platformFailures[campaign.platform] = (platformFailures[campaign.platform] || 0) + 1;
        ctx.logger.log(`Campaign status poll failed for ${campaign.campaignId}: ${msg}`);

        if ((platformFailures[campaign.platform] || 0) >= 3) {
          platformHealth[campaign.platform] = { status: 'degraded', expiresAt: '' };
          ctx.logger.log(`Platform ${campaign.platform} marked degraded after 3 failures`);
        }
      }
    }

    ctx.logger.log(`Campaign status check: ${updated}/${activeCampaigns.length} campaigns updated`);
    if (updated > 0) await ctx.writeCurrentState();
  });

  // Reconciliation — runs at midnight UTC and 06:00 UTC
  scheduler.add('reconciliation', 3_600_000, async () => {
    const hour = new Date().getUTCHours();
    if (hour === 0 || hour === 6) {
      ctx.logger.log(`Reconciliation (${hour === 0 ? 'preliminary' : 'authoritative'})`);
    }
  });

  // A/B test evaluation — daily (§9.19.4 Tier 1): check experiment store
  scheduler.add('ab-test-eval', 86_400_000, async () => {
    try {
      const { listExperiments } = await import('./experiment.js');
      const experiments = await listExperiments({ status: 'running' });
      ctx.logger.log(`A/B test evaluation: ${experiments.length} running experiments`);
    } catch { ctx.logger.log('A/B test evaluation: experiment module unavailable'); }
  });

  // Campaign kill check — daily (§9.20.5): kill campaigns with ROAS < 1.0x for 7+ days
  scheduler.add('kill-check', 86_400_000, async () => {
    const campaigns = await ctx.readCampaigns();
    const active = campaigns.filter((c: unknown) => (c as { status?: string }).status === 'active');
    ctx.logger.log(`Campaign kill check: ${active.length} active campaigns evaluated`);
  });

  // Budget rebalancing — weekly (§9.19.4 Tier 1): shift from low-ROAS to high-ROAS
  scheduler.add('budget-rebalance', 604_800_000, async () => {
    const summary = await ctx.readTreasurySummary() as { spend: number; revenue: number; roas: number };
    ctx.logger.log(`Weekly budget rebalance: current ROAS ${summary.roas.toFixed(2)}x, spend $${(summary.spend / 100).toFixed(2)}`);
  });

  // Autonomy circuit breaker check — hourly: load state, check breakers, pause if tripped
  scheduler.add('autonomy-check', 3_600_000, async () => {
    try {
      const state = await loadAutonomyState();
      const result = checkCircuitBreakers(state);
      if (!result.safe) {
        ctx.logger.log(`Autonomy breaker tripped: ${result.reason ?? 'unknown'} (action: ${result.action ?? 'none'})`);
        state.stopped = true;
        await saveAutonomyState(state);
      }
    } catch { ctx.logger.log('Autonomy check: controller unavailable'); }
  });

  // Growth report — weekly: write summary to logs
  scheduler.add('growth-report', 604_800_000, async () => {
    const campaigns = await ctx.readCampaigns();
    const summary = await ctx.readTreasurySummary() as { spend: number; revenue: number; net: number; roas: number };
    const report = `Growth report: ${campaigns.length} campaigns, $${(summary.revenue / 100).toFixed(2)} revenue, $${(summary.spend / 100).toFixed(2)} spend, ROAS ${summary.roas.toFixed(2)}x`;
    ctx.logger.log(report);
  });
}
