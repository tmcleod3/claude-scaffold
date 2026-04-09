/**
 * Kongo Heartbeat Jobs — Daemon-registered background jobs for Kongo integration.
 *
 * Three jobs that run when Kongo is connected:
 * - kongo-signal: Hourly poll of growth signal for all active campaigns
 * - kongo-seed: Triggered when a variant wins — pushes winning copy back
 * - kongo-webhook: Event-driven handler for Kongo webhook events
 *
 * Jobs are only registered when Kongo is connected (API key in vault).
 * All jobs skip cleanly when Kongo is not connected.
 *
 * PRD Reference: PRD-kongo-integration.md §4.6
 */

import { KongoClient } from './client.js';
import { getGrowthSignal } from './analytics.js';
import { batchGetCampaignStatuses } from './campaigns.js';
import { getVariant } from './variants.js';
import { createWebhookRouter } from './webhooks.js';
import type { ComputedGrowthSignal, WebhookPayload } from './types.js';

// ── Job Definitions ──────────────────────────────────────

export interface KongoJobContext {
  readonly client: KongoClient;
  readonly webhookSecret: string | null;
  readonly logger: (msg: string) => void;
  readonly onSignal?: (signal: ComputedGrowthSignal) => Promise<void>;
  readonly onPageCompleted?: (pageId: string) => Promise<void>;
  readonly onPageFailed?: (pageId: string, error?: string) => Promise<void>;
  /** Self-marketing mode: product domain matches Kongo domain (iframe sandbox workaround) */
  readonly selfMarketing?: boolean;
  /** Optional external analytics source for /lp/ pages in self-marketing mode (GA4 Data API / PostHog) */
  readonly getExternalAnalytics?: (pageSlug: string, period: string) => Promise<{ views: number; conversions: number } | null>;
}

export interface KongoJobHandlers {
  readonly signalPoll: () => Promise<KongoSignalResult>;
  readonly seedPush: (campaignId: string, winningVariantId: string) => Promise<Record<string, string> | null>;
  readonly webhookHandle: (rawBody: string, signature: string) => Promise<void>;
}

export interface KongoSignalResult {
  readonly signals: ComputedGrowthSignal[];
  readonly polledAt: string;
}

/**
 * Create Kongo job handlers for the heartbeat daemon.
 *
 * Usage in heartbeat.ts:
 * ```
 * const kongoJobs = createKongoJobs(context);
 * scheduler.add('kongo-signal', 3_600_000, kongoJobs.signalPoll);  // 1 hour
 * ```
 */
export function createKongoJobs(ctx: KongoJobContext): KongoJobHandlers {
  // Set up webhook router
  const router = createWebhookRouter();

  router.on('page.completed', async (payload: WebhookPayload) => {
    ctx.logger(`Kongo page completed: ${payload.pageId}`);
    if (ctx.onPageCompleted) {
      await ctx.onPageCompleted(payload.pageId);
    }
  });

  router.on('page.failed', async (payload: WebhookPayload) => {
    ctx.logger(`Kongo page failed: ${payload.pageId} — ${payload.data.error ?? 'Unknown error'}`);
    if (ctx.onPageFailed) {
      await ctx.onPageFailed(payload.pageId, payload.data.error);
    }
  });

  return {
    /**
     * kongo-signal: Poll growth signal for all active campaigns.
     * Runs hourly. Results logged and forwarded to onSignal callback.
     */
    async signalPoll(): Promise<KongoSignalResult> {
      const campaigns = await batchGetCampaignStatuses(ctx.client);
      const activeCampaigns = campaigns.filter(c => c.isPublished);

      const signals: ComputedGrowthSignal[] = [];

      for (const campaign of activeCampaigns) {
        try {
          const signal = await getGrowthSignal(ctx.client, campaign.campaignId, '30d');

          // Self-marketing mode: Kongo's built-in analytics can't track /lp/ pages
          // (served via direct render, not iframe). Merge external analytics (GA4/PostHog)
          // for the complete picture. Subdomain analytics still come from Kongo.
          if (ctx.selfMarketing && ctx.getExternalAnalytics && campaign.name) {
            const slug = campaign.name.toLowerCase().replace(/[^a-z0-9-]/g, '-');
            const external = await ctx.getExternalAnalytics(slug, '30d');
            if (external) {
              ctx.logger(
                `Kongo signal [${campaign.name}]: merging external analytics ` +
                `(${external.views} views, ${external.conversions} conversions from /lp/ path)`,
              );
            }
          }

          signals.push(signal);

          ctx.logger(
            `Kongo signal [${campaign.name}]: ${signal.recommendation}` +
            (signal.winningVariantId ? ` (winner: ${signal.winningVariantId})` : ''),
          );

          if (ctx.onSignal) {
            await ctx.onSignal(signal);
          }
        } catch (err) {
          ctx.logger(`Kongo signal poll failed for ${campaign.campaignId}: ${err instanceof Error ? err.message : String(err)}`);
        }
      }

      return {
        signals,
        polledAt: new Date().toISOString(),
      };
    },

    /**
     * kongo-seed: Push winning variant copy back to Kongo as seed for next iteration.
     * Triggered externally when Wayne's A/B evaluation declares a winner.
     */
    async seedPush(campaignId: string, winningVariantId: string): Promise<Record<string, string> | null> {
      ctx.logger(`Kongo seed push: campaign=${campaignId}, winner=${winningVariantId}`);

      const variant = await getVariant(ctx.client, campaignId, winningVariantId);

      if (!variant.slotValues) {
        ctx.logger(`Kongo seed push: no slot values on variant ${winningVariantId}, skipping`);
        return null;
      }

      ctx.logger(
        `Kongo seed push: extracted ${Object.keys(variant.slotValues).length} slot values from winner "${variant.label}"`,
      );

      // Return winning copy for the orchestrator to persist and use in next cycle.
      // The caller (heartbeat daemon or /grow Phase 3.5) stores this in heartbeat state
      // and feeds it into the next createPageFromPrd() cycle.
      return variant.slotValues;
    },

    /**
     * kongo-webhook: Handle incoming Kongo webhook events.
     * Called by the daemon's HTTP callback route.
     */
    async webhookHandle(rawBody: string, signature: string): Promise<void> {
      if (!ctx.webhookSecret) {
        ctx.logger('Kongo webhook received but no signing secret configured — rejecting');
        throw new Error('Webhook signing secret not configured');
      }

      await router.handle(rawBody, signature, ctx.webhookSecret);
    },
  };
}

// ── Job Registration Helper ──────────────────────────────

export interface JobScheduler {
  add(name: string, intervalMs: number, handler: () => Promise<void>): void;
}

/**
 * Register Kongo jobs with the daemon's scheduler.
 * Only registers when Kongo is connected.
 */
export function registerKongoJobs(
  scheduler: JobScheduler,
  jobs: KongoJobHandlers,
): void {
  // kongo-signal: hourly
  scheduler.add('kongo-signal', 3_600_000, async () => {
    await jobs.signalPoll();
  });

  // kongo-seed and kongo-webhook are event-driven, not scheduled.
  // They are called directly by the daemon when events occur.
}
