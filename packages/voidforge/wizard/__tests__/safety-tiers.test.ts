/**
 * Safety tier tests — budget authorization boundaries.
 * Tier 2: Financial authorization — boundary values matter.
 */

import { describe, it, expect } from 'vitest';
import { classifyTier, platformDailyCap, isAutonomouslyAllowed } from '../lib/safety-tiers.js';

type Cents = number & { readonly __brand: 'Cents' };
const cents = (n: number) => n as Cents;

describe('classifyTier', () => {
  // Thresholds: auto < 10000 agent < 50000 human = 50000 hard_stop
  it('should auto-approve budgets below $100/day', () => {
    const result = classifyTier(cents(2499), cents(0));
    expect(result.tier).toBe('auto_approve');
    expect(result.requiresVaultPassword).toBe(false);
  });

  it('should auto-approve $25/day (below agent threshold)', () => {
    const result = classifyTier(cents(2500), cents(0));
    expect(result.tier).toBe('auto_approve');
  });

  it('should agent-approve at $100/day (agentApproveBelow boundary)', () => {
    const result = classifyTier(cents(10000), cents(0));
    expect(result.tier).toBe('agent_approve');
    expect(result.requiresVaultPassword).toBe(true);
    expect(result.requiresTotp).toBe(false);
  });

  it('should hard-stop at $500/day', () => {
    const result = classifyTier(cents(50000), cents(0));
    expect(result.tier).toBe('hard_stop');
    expect(result.requiresVaultPassword).toBe(true);
    expect(result.requiresTotp).toBe(true);
  });

  it('should push tier up when aggregate exceeds agent threshold', () => {
    // $20/day + $90/day existing → $110 aggregate ≥ $100 agentApproveBelow
    const result = classifyTier(cents(2000), cents(9000));
    expect(result.tier).toBe('agent_approve');
  });

  it('should push to agent_approve when aggregate exceeds auto cap ($100)', () => {
    // $15/day + $90/day → $105 aggregate > aggregateAutoApproveMax (10000)
    const result = classifyTier(cents(1500), cents(9000));
    expect(result.tier).toBe('agent_approve');
  });
});

describe('platformDailyCap', () => {
  it('should return 90% of hard stop', () => {
    const cap = platformDailyCap();
    expect(cap).toBe(45000);
  });
});

describe('isAutonomouslyAllowed', () => {
  it('should allow protective actions', () => {
    expect(isAutonomouslyAllowed('pause_campaign')).toBe(true);
    expect(isAutonomouslyAllowed('kill_campaign')).toBe(true);
  });

  it('should allow read-only actions', () => {
    expect(isAutonomouslyAllowed('generate_report')).toBe(true);
    expect(isAutonomouslyAllowed('evaluate_ab_test')).toBe(true);
  });

  it('should allow maintenance actions', () => {
    expect(isAutonomouslyAllowed('refresh_token')).toBe(true);
    expect(isAutonomouslyAllowed('rebalance_budget')).toBe(true);
  });

  it('should deny spend-escalating actions', () => {
    expect(isAutonomouslyAllowed('create_campaign')).toBe(false);
    expect(isAutonomouslyAllowed('increase_budget')).toBe(false);
    expect(isAutonomouslyAllowed('resume_campaign')).toBe(false);
  });

  it('should deny privileged actions', () => {
    expect(isAutonomouslyAllowed('unfreeze')).toBe(false);
    expect(isAutonomouslyAllowed('modify_code')).toBe(false);
  });
});
