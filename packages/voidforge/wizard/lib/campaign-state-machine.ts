/**
 * Campaign State Machine — Event-sourced transitions with validation (§9.17).
 *
 * 10 states, validated transitions, event-sourced history.
 * Only valid transitions are allowed. Invalid transitions throw.
 * Each transition is logged as an event with source, reason, and optional ruleId.
 *
 * PRD Reference: §9.9 (GrowthCampaign), §9.17 (state machine), §9.19.11 (agent source)
 */

type CampaignStatus =
  | 'draft'
  | 'pending_approval'
  | 'creating'
  | 'active'
  | 'paused'
  | 'completed'
  | 'error'
  | 'suspended'
  | 'deleting'
  | 'freeze_pending';

type CampaignEventSource = 'cli' | 'daemon' | 'platform' | 'agent';

interface CampaignStateEvent {
  timestamp: string;
  source: CampaignEventSource;
  oldStatus: CampaignStatus;
  newStatus: CampaignStatus;
  reason: string;
  ruleId?: string;
}

// ── Valid Transitions ─────────────────────────────────

const VALID_TRANSITIONS: Record<CampaignStatus, CampaignStatus[]> = {
  draft:              ['pending_approval', 'deleting'],
  pending_approval:   ['creating', 'draft', 'deleting'],     // approve → creating, reject → draft
  creating:           ['active', 'error', 'deleting'],        // success → active, fail → error
  active:             ['paused', 'completed', 'error', 'suspended', 'deleting', 'freeze_pending'],
  paused:             ['active', 'deleting', 'completed'],    // resume, delete, or mark done
  completed:          [],                                      // terminal
  error:              ['creating', 'deleting', 'draft'],      // retry → creating, abandon → deleting
  suspended:          ['active', 'paused', 'deleting'],       // platform reinstates, or we give up
  deleting:           ['completed'],                           // deletion confirmed → terminal
  freeze_pending:     ['paused', 'active'],                   // freeze succeeds → paused, freeze fails → active
};

// ── Agent-Allowed Transitions (§9.19.11) ──────────────
// Daemon Tier 1 rules can ONLY perform these transitions

const AGENT_ALLOWED_TRANSITIONS: Array<{ from: CampaignStatus; to: CampaignStatus }> = [
  { from: 'active', to: 'paused' },   // kill underperformer, A/B test loser
];

const AGENT_ALLOWED_REASONS = [
  'killed_by_agent',
  'underperforming',
  'budget_exhausted',
  'ab_test_loser',
];

// ── State Machine ─────────────────────────────────────

function isValidTransition(from: CampaignStatus, to: CampaignStatus): boolean {
  return VALID_TRANSITIONS[from]?.includes(to) ?? false;
}

function isAgentAllowed(from: CampaignStatus, to: CampaignStatus, reason: string): boolean {
  const transitionOk = AGENT_ALLOWED_TRANSITIONS.some(t => t.from === from && t.to === to);
  const reasonOk = AGENT_ALLOWED_REASONS.includes(reason);
  return transitionOk && reasonOk;
}

function transition(
  currentStatus: CampaignStatus,
  newStatus: CampaignStatus,
  source: CampaignEventSource,
  reason: string,
  ruleId?: string
): CampaignStateEvent {
  // Validate transition is valid
  if (!isValidTransition(currentStatus, newStatus)) {
    throw new Error(
      `Invalid campaign transition: ${currentStatus} → ${newStatus}. ` +
      `Valid targets from ${currentStatus}: [${VALID_TRANSITIONS[currentStatus].join(', ')}]`
    );
  }

  // If source is 'agent', validate it's in the allowed set
  if (source === 'agent' && !isAgentAllowed(currentStatus, newStatus, reason)) {
    throw new Error(
      `Agent-initiated transition ${currentStatus} → ${newStatus} (reason: ${reason}) is not authorized. ` +
      `Agents can only: active → paused with reasons: ${AGENT_ALLOWED_REASONS.join(', ')}`
    );
  }

  return {
    timestamp: new Date().toISOString(),
    source,
    oldStatus: currentStatus,
    newStatus,
    reason,
    ruleId,
  };
}

// ── Spend Execution Pipeline ──────────────────────────
// Budget lock + idempotency keys for campaign creation

interface SpendIntent {
  intentId: string;          // UUID — idempotency key (ADR-3)
  platform: string;
  campaignConfig: unknown;   // CampaignConfig from growth-campaigns.json
  budgetLocked: boolean;     // Whether daily budget has been reserved
  status: 'pending' | 'executing' | 'completed' | 'failed' | 'stale';
  createdAt: string;
  completedAt?: string;
  error?: string;
}

/**
 * Create a spend intent (WAL entry) before executing a platform API call.
 * The intent ID serves as the idempotency key for the platform (ADR-3).
 */
function createSpendIntent(
  intentId: string,
  platform: string,
  campaignConfig: unknown
): SpendIntent {
  return {
    intentId,
    platform,
    campaignConfig,
    budgetLocked: false,
    status: 'pending',
    createdAt: new Date().toISOString(),
  };
}

/**
 * Lock the budget for a spend intent.
 * Verifies the daily budget has room for this campaign.
 * Returns false if budget is exhausted.
 */
function lockBudget(
  intent: SpendIntent,
  dailyBudgetCents: number,
  currentDailySpendCents: number,
  hardStopCents: number
): boolean {
  if (currentDailySpendCents + dailyBudgetCents >= hardStopCents) {
    return false; // Would exceed hard stop
  }
  intent.budgetLocked = true;
  return true;
}

/**
 * Execute the spend intent: WAL → platform API → spend log → campaign record.
 * Each step is logged. On failure, the intent is marked failed and can be retried.
 */
async function executeSpendIntent(
  intent: SpendIntent,
  platformCall: () => Promise<{ externalId: string }>,
  logSpend: (intentId: string, externalId: string) => Promise<void>
): Promise<{ success: boolean; externalId?: string; error?: string }> {
  if (!intent.budgetLocked) {
    return { success: false, error: 'Budget not locked — call lockBudget() first' };
  }

  intent.status = 'executing';

  try {
    // Step 1: Call platform API with idempotency key
    const result = await platformCall();

    // Step 2: Log to spend log
    await logSpend(intent.intentId, result.externalId);

    // Step 3: Mark complete
    intent.status = 'completed';
    intent.completedAt = new Date().toISOString();
    return { success: true, externalId: result.externalId };
  } catch (err) {
    intent.status = 'failed';
    intent.error = String(err);
    return { success: false, error: String(err) };
  }
}

// ── Pause Reasons (expanded per §9.17) ────────────────

type PauseReason =
  | 'budget_exhausted'
  | 'user_paused'
  | 'compliance'
  | 'underperforming'
  | 'freeze'
  | 'token_expired'
  | 'platform_suspended'
  | 'approval_timeout'
  | 'killed_by_agent'
  | 'killed_by_user'
  | 'ab_test_loser';

export type { CampaignStatus, CampaignEventSource, CampaignStateEvent, SpendIntent, PauseReason };
export {
  VALID_TRANSITIONS, AGENT_ALLOWED_TRANSITIONS, AGENT_ALLOWED_REASONS,
  isValidTransition, isAgentAllowed, transition,
  createSpendIntent, lockBudget, executeSpendIntent,
};
