/**
 * Safety Tier Schema — Budget authorization and spend control.
 *
 * Half-open intervals for budget tiers (§9.17):
 *   [0, 2500) cents/day: auto-approve (ongoing spend only — new campaigns need vault password)
 *   [2500, 10000) cents/day: agent approval (Dockson + Steris)
 *   [10000, 50000) cents/day: human confirmation + TOTP
 *   >= 50000 cents/day: hard stop + TOTP + vault password
 *
 * Aggregate auto-approve limit: $100/day across all campaigns (§9.17)
 * Hard stop buffer: platform cap set 10% below VoidForge hard stop (§9.17)
 *
 * Campaign creation rate limits (§9.19.14 + §9.20.3d):
 *   Max 5 daemon-initiated campaigns per 24h
 *   Max 10 active campaigns per platform
 *   Burst detection: >3 within 15 minutes → pause and alert
 *
 * PRD Reference: §9.4, §9.17, §9.19.5, §9.19.14, §9.20.5
 */

// Use the branded Cents type from financial-transaction.ts pattern
type Cents = number & { readonly __brand: 'Cents' };

// ── Safety Tier Definitions ───────────────────────────

type SafetyTier = 'auto_approve' | 'agent_approve' | 'human_confirm' | 'hard_stop';

interface SafetyTierConfig {
  autoApproveBelow: Cents;     // default: 2500 ($25/day)
  agentApproveBelow: Cents;    // default: 10000 ($100/day)
  humanConfirmBelow: Cents;    // default: 50000 ($500/day)
  hardStopAbove: Cents;        // default: 50000 ($500/day)
  aggregateAutoApproveMax: Cents; // default: 10000 ($100/day across all campaigns)
  hardStopBuffer: number;      // default: 0.10 (10% — platform cap set 10% below)
}

const DEFAULT_TIERS: SafetyTierConfig = {
  autoApproveBelow: 2500 as Cents,
  agentApproveBelow: 10000 as Cents,
  humanConfirmBelow: 50000 as Cents,
  hardStopAbove: 50000 as Cents,
  aggregateAutoApproveMax: 10000 as Cents,
  hardStopBuffer: 0.10,
};

// ── Tier Classification ───────────────────────────────

interface TierResult {
  tier: SafetyTier;
  requiresVaultPassword: boolean;
  requiresTotp: boolean;
  reason: string;
}

/**
 * Classify a daily budget amount into its safety tier.
 * Also considers aggregate spend across all campaigns.
 */
function classifyTier(
  dailyBudget: Cents,
  aggregateDailySpend: Cents,
  config: SafetyTierConfig = DEFAULT_TIERS
): TierResult {
  // Check if aggregate would push into a higher tier
  const newAggregate = (aggregateDailySpend + dailyBudget) as Cents;

  if (dailyBudget >= config.hardStopAbove) {
    return {
      tier: 'hard_stop',
      requiresVaultPassword: true,
      requiresTotp: true,
      reason: `Daily budget $${dailyBudget / 100} exceeds hard stop ($${config.hardStopAbove / 100}/day)`,
    };
  }

  if (dailyBudget >= config.humanConfirmBelow || newAggregate >= config.humanConfirmBelow) {
    return {
      tier: 'human_confirm',
      requiresVaultPassword: true,
      requiresTotp: true,
      reason: dailyBudget >= config.humanConfirmBelow
        ? `Daily budget $${dailyBudget / 100} requires human confirmation`
        : `Aggregate $${newAggregate / 100}/day pushes into human confirmation tier`,
    };
  }

  if (dailyBudget >= config.agentApproveBelow || newAggregate >= config.agentApproveBelow) {
    return {
      tier: 'agent_approve',
      requiresVaultPassword: true,
      requiresTotp: false,
      reason: dailyBudget >= config.agentApproveBelow
        ? `Daily budget $${dailyBudget / 100} requires agent approval (Dockson + Steris)`
        : `Aggregate $${newAggregate / 100}/day pushes into agent approval tier`,
    };
  }

  // Auto-approve tier — but check aggregate cap
  if (newAggregate > config.aggregateAutoApproveMax) {
    return {
      tier: 'agent_approve',
      requiresVaultPassword: true,
      requiresTotp: false,
      reason: `Individual budget $${dailyBudget / 100} is auto-approve, but aggregate $${newAggregate / 100}/day exceeds $${config.aggregateAutoApproveMax / 100} cap`,
    };
  }

  return {
    tier: 'auto_approve',
    requiresVaultPassword: false, // For ONGOING spend. New campaign creation always needs vault password.
    requiresTotp: false,
    reason: `Daily budget $${dailyBudget / 100} within auto-approve tier`,
  };
}

/**
 * Calculate the platform-level daily cap (10% below VoidForge hard stop).
 * This is set on the ad platform side so the platform enforces the cap
 * even if VoidForge crashes.
 */
function platformDailyCap(config: SafetyTierConfig = DEFAULT_TIERS): Cents {
  return Math.floor(config.hardStopAbove * (1 - config.hardStopBuffer)) as Cents;
}

// ── Campaign Creation Rate Limits (§9.19.14) ──────────

interface RateLimitConfig {
  maxPerDay: number;           // default: 5 (daemon-initiated only)
  maxActivePerPlatform: number; // default: 10
  burstThreshold: number;      // default: 3 within burstWindow
  burstWindowMs: number;       // default: 15 minutes
}

const DEFAULT_RATE_LIMITS: RateLimitConfig = {
  maxPerDay: 5,
  maxActivePerPlatform: 10,
  burstThreshold: 3,
  burstWindowMs: 15 * 60 * 1000,
};

interface RateLimitState {
  creationsToday: number;
  creationTimestamps: number[]; // timestamps of recent creations
  activeCampaignsByPlatform: Record<string, number>;
}

interface RateLimitResult {
  allowed: boolean;
  reason?: string;
  burst?: boolean;
}

/**
 * Check if a campaign creation is allowed by rate limits.
 * Only applies to daemon-initiated creation (Tier 1/3).
 * Human-triggered /grow Phase 4 is exempt (§9.20.3d).
 */
function checkCreationRateLimit(
  state: RateLimitState,
  platform: string,
  isDaemonInitiated: boolean,
  config: RateLimitConfig = DEFAULT_RATE_LIMITS
): RateLimitResult {
  // Human-triggered is exempt from per-day limit
  if (!isDaemonInitiated) {
    // Still check per-platform active limit and burst detection
    if ((state.activeCampaignsByPlatform[platform] ?? 0) >= config.maxActivePerPlatform) {
      return { allowed: false, reason: `Maximum ${config.maxActivePerPlatform} active campaigns on ${platform}` };
    }
    // Burst detection applies to all sources
    const now = Date.now();
    const recentCount = state.creationTimestamps.filter(t => now - t < config.burstWindowMs).length;
    if (recentCount >= config.burstThreshold) {
      return { allowed: false, reason: `Burst detected: ${recentCount} campaigns in ${config.burstWindowMs / 60000} minutes`, burst: true };
    }
    return { allowed: true };
  }

  // Daemon-initiated — full rate limit check
  if (state.creationsToday >= config.maxPerDay) {
    return { allowed: false, reason: `Maximum ${config.maxPerDay} daemon-initiated campaigns per 24 hours` };
  }

  if ((state.activeCampaignsByPlatform[platform] ?? 0) >= config.maxActivePerPlatform) {
    return { allowed: false, reason: `Maximum ${config.maxActivePerPlatform} active campaigns on ${platform}` };
  }

  const now = Date.now();
  const recentCount = state.creationTimestamps.filter(t => now - t < config.burstWindowMs).length;
  if (recentCount >= config.burstThreshold) {
    return { allowed: false, reason: `Burst detected: ${recentCount} campaigns in ${config.burstWindowMs / 60000} minutes`, burst: true };
  }

  return { allowed: true };
}

// ── Autonomous Scope (§9.19.5) ────────────────────────

type AutonomousAction =
  | 'pause_campaign'       // Allowed — protective
  | 'kill_campaign'        // Allowed — protective (maps to pause with reason)
  | 'evaluate_ab_test'     // Allowed — deterministic
  | 'rebalance_budget'     // Allowed — within aggregate cap, via self-command
  | 'generate_report'      // Allowed — read-only
  | 'refresh_token'        // Allowed — maintenance
  | 'create_campaign'      // DENIED — requires human confirmation
  | 'resume_campaign'      // DENIED — re-enables spend
  | 'increase_budget'      // DENIED — escalation only
  | 'unfreeze'             // DENIED — requires TOTP
  | 'modify_code';         // DENIED — requires human merge

function isAutonomouslyAllowed(action: AutonomousAction): boolean {
  const allowed: AutonomousAction[] = [
    'pause_campaign', 'kill_campaign', 'evaluate_ab_test',
    'rebalance_budget', 'generate_report', 'refresh_token',
  ];
  return allowed.includes(action);
}

export type { SafetyTierConfig, TierResult, RateLimitConfig, RateLimitState, RateLimitResult, AutonomousAction, Cents };
export { DEFAULT_TIERS, DEFAULT_RATE_LIMITS, classifyTier, platformDailyCap, checkCreationRateLimit, isAutonomouslyAllowed };
