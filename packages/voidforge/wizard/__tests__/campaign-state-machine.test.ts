/**
 * Campaign state machine tests — transitions, agent restrictions, spend intent pipeline.
 * Tier 1: State machine correctness prevents runaway spend and invalid campaign lifecycle.
 */

import { describe, it, expect } from 'vitest';
import {
  transition,
  isValidTransition,
  isAgentAllowed,
  createSpendIntent,
  lockBudget,
  executeSpendIntent,
  VALID_TRANSITIONS,
} from '../lib/campaign-state-machine.js';
import type { CampaignStatus } from '../lib/campaign-state-machine.js';

describe('valid transitions', () => {
  it('should allow draft -> pending_approval', () => {
    const event = transition('draft', 'pending_approval', 'cli', 'submit for review');
    expect(event.oldStatus).toBe('draft');
    expect(event.newStatus).toBe('pending_approval');
    expect(event.source).toBe('cli');
    expect(event.reason).toBe('submit for review');
    expect(event.timestamp).toBeDefined();
  });

  it('should allow pending_approval -> creating (approve)', () => {
    const event = transition('pending_approval', 'creating', 'cli', 'approved');
    expect(event.newStatus).toBe('creating');
  });

  it('should allow creating -> active (success)', () => {
    const event = transition('creating', 'active', 'daemon', 'platform confirmed');
    expect(event.newStatus).toBe('active');
  });

  it('should allow active -> paused', () => {
    const event = transition('active', 'paused', 'cli', 'user_paused');
    expect(event.newStatus).toBe('paused');
  });

  it('should allow paused -> active (resume)', () => {
    const event = transition('paused', 'active', 'cli', 'resumed');
    expect(event.newStatus).toBe('active');
  });

  it('should allow full lifecycle: draft -> review -> creating -> active -> paused -> active', () => {
    const e1 = transition('draft', 'pending_approval', 'cli', 'submit');
    const e2 = transition(e1.newStatus, 'creating', 'cli', 'approved');
    const e3 = transition(e2.newStatus, 'active', 'daemon', 'created');
    const e4 = transition(e3.newStatus, 'paused', 'cli', 'pause');
    const e5 = transition(e4.newStatus, 'active', 'cli', 'resume');
    expect(e5.newStatus).toBe('active');
  });

  it('should allow active -> completed', () => {
    const event = transition('active', 'completed', 'daemon', 'budget exhausted');
    expect(event.newStatus).toBe('completed');
  });

  it('should allow active -> suspended', () => {
    const event = transition('active', 'suspended', 'platform', 'platform suspended');
    expect(event.newStatus).toBe('suspended');
  });

  it('should allow error -> creating (retry)', () => {
    const event = transition('error', 'creating', 'cli', 'retry');
    expect(event.newStatus).toBe('creating');
  });

  it('should allow active -> freeze_pending', () => {
    const event = transition('active', 'freeze_pending', 'daemon', 'freeze requested');
    expect(event.newStatus).toBe('freeze_pending');
  });

  it('should allow freeze_pending -> paused (freeze succeeds)', () => {
    const event = transition('freeze_pending', 'paused', 'daemon', 'freeze confirmed');
    expect(event.newStatus).toBe('paused');
  });

  it('should include ruleId when provided', () => {
    const event = transition('active', 'paused', 'agent', 'killed_by_agent', 'rule-T1-001');
    expect(event.ruleId).toBe('rule-T1-001');
  });
});

describe('invalid transitions', () => {
  it('should reject draft -> active (must go through approval)', () => {
    expect(() => transition('draft', 'active', 'cli', 'skip approval')).toThrow(
      'Invalid campaign transition'
    );
  });

  it('should reject completed -> active (terminal state)', () => {
    expect(() => transition('completed', 'active', 'cli', 'resurrect')).toThrow(
      'Invalid campaign transition'
    );
  });

  it('should reject paused -> creating', () => {
    expect(() => transition('paused', 'creating', 'cli', 'invalid')).toThrow(
      'Invalid campaign transition'
    );
  });

  it('should reject active -> draft', () => {
    expect(() => transition('active', 'draft', 'cli', 'revert')).toThrow(
      'Invalid campaign transition'
    );
  });

  it('should include valid targets in error message', () => {
    try {
      transition('draft', 'active', 'cli', 'test');
      expect.unreachable('should have thrown');
    } catch (err) {
      expect((err as Error).message).toContain('pending_approval');
      expect((err as Error).message).toContain('deleting');
    }
  });
});

describe('isAgentAllowed', () => {
  it('should allow agent to transition active -> paused with valid reason', () => {
    expect(isAgentAllowed('active', 'paused', 'killed_by_agent')).toBe(true);
    expect(isAgentAllowed('active', 'paused', 'underperforming')).toBe(true);
    expect(isAgentAllowed('active', 'paused', 'budget_exhausted')).toBe(true);
    expect(isAgentAllowed('active', 'paused', 'ab_test_loser')).toBe(true);
  });

  it('should reject agent for non-allowed transitions', () => {
    expect(isAgentAllowed('active', 'completed', 'killed_by_agent')).toBe(false);
    expect(isAgentAllowed('paused', 'active', 'killed_by_agent')).toBe(false);
    expect(isAgentAllowed('draft', 'pending_approval', 'killed_by_agent')).toBe(false);
  });

  it('should reject agent for allowed transition but invalid reason', () => {
    expect(isAgentAllowed('active', 'paused', 'user_paused')).toBe(false);
    expect(isAgentAllowed('active', 'paused', 'random_reason')).toBe(false);
  });

  it('should throw when daemon agent tries unauthorized transition', () => {
    // Agent source + non-allowed transition
    expect(() => transition('paused', 'active', 'agent', 'resume')).toThrow(
      'not authorized'
    );
  });

  it('should throw when agent uses invalid reason on allowed transition', () => {
    expect(() => transition('active', 'paused', 'agent', 'user_paused')).toThrow(
      'not authorized'
    );
  });

  it('should succeed when agent uses valid transition and reason', () => {
    const event = transition('active', 'paused', 'agent', 'killed_by_agent', 'rule-T1-002');
    expect(event.source).toBe('agent');
    expect(event.newStatus).toBe('paused');
    expect(event.ruleId).toBe('rule-T1-002');
  });
});

describe('isValidTransition', () => {
  it('should validate all defined transitions', () => {
    for (const [from, targets] of Object.entries(VALID_TRANSITIONS)) {
      for (const to of targets) {
        expect(isValidTransition(from as CampaignStatus, to)).toBe(true);
      }
    }
  });

  it('should reject completed -> anything (terminal)', () => {
    const states: CampaignStatus[] = [
      'draft', 'pending_approval', 'creating', 'active', 'paused',
      'error', 'suspended', 'deleting', 'freeze_pending',
    ];
    for (const target of states) {
      expect(isValidTransition('completed', target)).toBe(false);
    }
  });
});

describe('spend intent pipeline', () => {
  it('should create a pending spend intent', () => {
    const intent = createSpendIntent('intent-001', 'meta', { name: 'Test Campaign' });
    expect(intent.intentId).toBe('intent-001');
    expect(intent.platform).toBe('meta');
    expect(intent.budgetLocked).toBe(false);
    expect(intent.status).toBe('pending');
    expect(intent.createdAt).toBeDefined();
  });

  it('should lock budget when under hard stop', () => {
    const intent = createSpendIntent('intent-002', 'google', {});
    // daily budget: $10 (1000 cents), current spend: $400 (40000), hard stop: $500 (50000)
    const locked = lockBudget(intent, 1000, 40000, 50000);
    expect(locked).toBe(true);
    expect(intent.budgetLocked).toBe(true);
  });

  it('should reject budget lock when it would exceed hard stop', () => {
    const intent = createSpendIntent('intent-003', 'meta', {});
    // daily budget: $100 (10000 cents), current spend: $450 (45000), hard stop: $500 (50000)
    const locked = lockBudget(intent, 10000, 45000, 50000);
    expect(locked).toBe(false);
    expect(intent.budgetLocked).toBe(false);
  });

  it('should reject budget lock at exact hard stop boundary', () => {
    const intent = createSpendIntent('intent-004', 'meta', {});
    // current + daily = exactly hard stop — still rejected (>= check)
    const locked = lockBudget(intent, 10000, 40000, 50000);
    expect(locked).toBe(false);
  });

  it('should execute spend intent successfully', async () => {
    const intent = createSpendIntent('intent-005', 'meta', {});
    lockBudget(intent, 1000, 0, 50000);

    const platformCall = async () => ({ externalId: 'ext-abc-123' });
    const logSpend = async (_intentId: string, _extId: string) => {};

    const result = await executeSpendIntent(intent, platformCall, logSpend);
    expect(result.success).toBe(true);
    expect(result.externalId).toBe('ext-abc-123');
    expect(intent.status).toBe('completed');
    expect(intent.completedAt).toBeDefined();
  });

  it('should fail execution when budget is not locked', async () => {
    const intent = createSpendIntent('intent-006', 'meta', {});
    // Don't lock the budget

    const platformCall = async () => ({ externalId: 'ext-xyz' });
    const logSpend = async () => {};

    const result = await executeSpendIntent(intent, platformCall, logSpend);
    expect(result.success).toBe(false);
    expect(result.error).toContain('Budget not locked');
  });

  it('should handle platform API failure gracefully', async () => {
    const intent = createSpendIntent('intent-007', 'meta', {});
    lockBudget(intent, 1000, 0, 50000);

    const platformCall = async () => { throw new Error('Platform API timeout'); };
    const logSpend = async () => {};

    const result = await executeSpendIntent(intent, platformCall, logSpend);
    expect(result.success).toBe(false);
    expect(result.error).toContain('Platform API timeout');
    expect(intent.status).toBe('failed');
  });

  it('should handle spend log failure gracefully', async () => {
    const intent = createSpendIntent('intent-008', 'meta', {});
    lockBudget(intent, 1000, 0, 50000);

    const platformCall = async () => ({ externalId: 'ext-ok' });
    const logSpend = async () => { throw new Error('Disk full'); };

    const result = await executeSpendIntent(intent, platformCall, logSpend);
    expect(result.success).toBe(false);
    expect(result.error).toContain('Disk full');
    expect(intent.status).toBe('failed');
  });
});
