/**
 * Autonomy controller tests — state, circuit breakers, proposals, kill switch, deploy freeze.
 * Tier 1: Safety-critical autonomous execution control.
 */

import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest';
import { createTempHome, cleanupTempHome } from './helpers/temp-dir.js';
import { join } from 'node:path';

const tempDir = await createTempHome();
const deepCurrentDir = join(tempDir, 'deep-current');

// Mock deep-current to redirect DEEP_CURRENT_DIR to temp
vi.mock('../lib/deep-current.js', () => ({
  DEEP_CURRENT_DIR: deepCurrentDir,
}));

const autonomy = await import('../lib/autonomy-controller.js');

afterAll(async () => {
  await cleanupTempHome(tempDir);
});

// ── Helpers ──────────────────────────────────────────

function freshState(): ReturnType<typeof structuredClone<typeof autonomy.DEFAULT_STATE>> {
  return structuredClone(autonomy.DEFAULT_STATE);
}

function makeMockProposal() {
  return {
    id: 'test-proposal-1',
    name: 'Test Campaign',
    generatedAt: new Date().toISOString(),
    trigger: 'test',
    dimension: 'quality',
    dimensionScore: 50,
    theCase: 'Testing purposes',
    missions: [{ number: 1, name: 'Mission 1', objective: 'Test', estimatedFiles: 5 }],
    expectedImpact: 'Improve test coverage',
    riskAssessment: 'Low risk',
    alternativesConsidered: ['Do nothing'],
    autonomyRecommendation: 2 as const,
    estimatedSessions: 1,
  };
}

describe('loadAutonomyState + saveAutonomyState', () => {
  it('should return default state when no file exists', async () => {
    const state = await autonomy.loadAutonomyState();
    expect(state.tier).toBe(1);
    expect(state.active).toBe(false);
    expect(state.stopped).toBe(false);
    expect(state.campaignsRun).toBe(0);
  });

  it('should save and reload state', async () => {
    const state = freshState();
    state.tier = 2;
    state.campaignsRun = 5;
    state.active = true;

    await autonomy.saveAutonomyState(state);
    const loaded = await autonomy.loadAutonomyState();

    expect(loaded.tier).toBe(2);
    expect(loaded.campaignsRun).toBe(5);
    expect(loaded.active).toBe(true);
  });
});

describe('checkCircuitBreakers', () => {
  it('should return safe for default state', () => {
    const state = freshState();
    const result = autonomy.checkCircuitBreakers(state);
    expect(result.safe).toBe(true);
    expect(result.reason).toBeUndefined();
  });

  it('should block when kill switch is engaged', () => {
    const state = freshState();
    state.stopped = true;
    const result = autonomy.checkCircuitBreakers(state);
    expect(result.safe).toBe(false);
    expect(result.action).toBe('stop');
    expect(result.reason).toContain('Kill switch');
  });

  it('should pause when strategic drift exceeds 30%', () => {
    const state = freshState();
    state.circuitBreakers.driftScore = 35;
    const result = autonomy.checkCircuitBreakers(state);
    expect(result.safe).toBe(false);
    expect(result.action).toBe('pause');
    expect(result.reason).toContain('drift');
  });

  it('should allow drift at exactly 30%', () => {
    const state = freshState();
    state.circuitBreakers.driftScore = 30;
    const result = autonomy.checkCircuitBreakers(state);
    expect(result.safe).toBe(true);
  });

  it('should downgrade to tier 1 after 3 consecutive criticals', () => {
    const state = freshState();
    state.circuitBreakers.consecutiveCriticals = 3;
    const result = autonomy.checkCircuitBreakers(state);
    expect(result.safe).toBe(false);
    expect(result.action).toBe('downgrade_to_tier1');
  });

  it('should pause after 7 consecutive days of spend increase', () => {
    const state = freshState();
    state.circuitBreakers.spendIncreaseStreak = 7;
    const result = autonomy.checkCircuitBreakers(state);
    expect(result.safe).toBe(false);
    expect(result.action).toBe('pause');
    expect(result.reason).toContain('spend');
  });

  it('should pause when ROAS below 1.0 for 7+ days', () => {
    const state = freshState();
    state.circuitBreakers.roasBelow1 = 7;
    const result = autonomy.checkCircuitBreakers(state);
    expect(result.safe).toBe(false);
    expect(result.action).toBe('pause');
    expect(result.reason).toContain('ROAS');
  });

  it('should pause when 30-day strategic sync is overdue', () => {
    const state = freshState();
    // Set lastStrategicSync to 31 days ago
    state.lastStrategicSync = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000).toISOString();
    const result = autonomy.checkCircuitBreakers(state);
    expect(result.safe).toBe(false);
    expect(result.action).toBe('pause');
    expect(result.reason).toContain('strategic sync');
  });

  it('should pause tier 3 after 10 consecutive autonomous campaigns', () => {
    const state = freshState();
    state.tier = 3;
    state.consecutiveCampaigns = 10;
    const result = autonomy.checkCircuitBreakers(state);
    expect(result.safe).toBe(false);
    expect(result.action).toBe('pause');
    expect(result.reason).toContain('10 autonomous');
  });

  it('should NOT pause tier 2 at 10 consecutive campaigns', () => {
    const state = freshState();
    state.tier = 2;
    state.consecutiveCampaigns = 10;
    const result = autonomy.checkCircuitBreakers(state);
    expect(result.safe).toBe(true);
  });
});

describe('deploy freeze window', () => {
  it('should pause during a deploy freeze window', () => {
    const state = freshState();
    const now = new Date();
    state.deployFreezeWindows = [
      { dayOfWeek: now.getUTCDay(), startHour: 0, endHour: 24 }, // All day today
    ];
    const result = autonomy.checkCircuitBreakers(state);
    expect(result.safe).toBe(false);
    expect(result.action).toBe('pause');
    expect(result.reason).toContain('deploy freeze');
  });

  it('should allow execution outside freeze window', () => {
    const state = freshState();
    const now = new Date();
    // Set freeze window to a different day
    const differentDay = (now.getUTCDay() + 3) % 7;
    state.deployFreezeWindows = [
      { dayOfWeek: differentDay, startHour: 0, endHour: 24 },
    ];
    const result = autonomy.checkCircuitBreakers(state);
    expect(result.safe).toBe(true);
  });
});

describe('queueProposal + isProposalReady', () => {
  it('should queue a proposal with 24h delay', () => {
    const state = freshState();
    state.tier = 2;
    const proposal = makeMockProposal();
    const updated = autonomy.queueProposal(state, proposal);

    expect(updated.pendingProposal).toBeDefined();
    expect(updated.pendingProposal!.proposal.name).toBe('Test Campaign');
    expect(updated.pendingProposal!.vetoed).toBe(false);

    // Should not be ready yet (24h delay)
    expect(autonomy.isProposalReady(updated)).toBe(false);
  });

  it('should be ready after 24h for tier 2', () => {
    const state = freshState();
    state.tier = 2;
    const proposal = makeMockProposal();
    const updated = autonomy.queueProposal(state, proposal);

    // Move executeAt to the past
    updated.pendingProposal!.executeAt = new Date(Date.now() - 1000).toISOString();
    expect(autonomy.isProposalReady(updated)).toBe(true);
  });

  it('should be immediately ready for tier 3', () => {
    const state = freshState();
    state.tier = 3;
    const proposal = makeMockProposal();
    const updated = autonomy.queueProposal(state, proposal);

    // Tier 3 executes immediately
    expect(autonomy.isProposalReady(updated)).toBe(true);
  });

  it('should not be ready when no proposal is queued', () => {
    const state = freshState();
    expect(autonomy.isProposalReady(state)).toBe(false);
  });
});

describe('vetoProposal', () => {
  it('should mark the pending proposal as vetoed', () => {
    const state = freshState();
    state.tier = 2;
    const proposal = makeMockProposal();
    const queued = autonomy.queueProposal(state, proposal);
    const vetoed = autonomy.vetoProposal(queued);

    expect(vetoed.pendingProposal!.vetoed).toBe(true);
    expect(autonomy.isProposalReady(vetoed)).toBe(false);
  });
});

describe('kill switch', () => {
  it('should stop all activity when engaged', () => {
    const state = freshState();
    state.active = true;
    state.tier = 2;
    const proposal = makeMockProposal();
    const queued = autonomy.queueProposal(state, proposal);

    const killed = autonomy.engageKillSwitch(queued);
    expect(killed.stopped).toBe(true);
    expect(killed.active).toBe(false);
    expect(killed.pendingProposal).toBeUndefined();

    // Circuit breaker should block everything
    const result = autonomy.checkCircuitBreakers(killed);
    expect(result.safe).toBe(false);
    expect(result.action).toBe('stop');
  });

  it('should resume after disengaging kill switch', () => {
    const state = freshState();
    const killed = autonomy.engageKillSwitch(state);
    const resumed = autonomy.disengageKillSwitch(killed);
    expect(resumed.stopped).toBe(false);

    const result = autonomy.checkCircuitBreakers(resumed);
    expect(result.safe).toBe(true);
  });
});

describe('recordStrategicSync', () => {
  it('should update sync timestamps and reset consecutive campaigns', () => {
    const state = freshState();
    state.consecutiveCampaigns = 8;
    const synced = autonomy.recordStrategicSync(state);

    expect(synced.consecutiveCampaigns).toBe(0);
    expect(new Date(synced.lastStrategicSync).getTime()).toBeGreaterThan(Date.now() - 1000);
    expect(new Date(synced.lastHumanReview).getTime()).toBeGreaterThan(Date.now() - 1000);
  });
});

describe('recordCampaignComplete', () => {
  it('should increment counters and clear pending proposal', () => {
    const state = freshState();
    state.tier = 2;
    const proposal = makeMockProposal();
    const queued = autonomy.queueProposal(state, proposal);
    queued.campaignsRun = 3;
    queued.consecutiveCampaigns = 2;

    const completed = autonomy.recordCampaignComplete(queued);
    expect(completed.campaignsRun).toBe(4);
    expect(completed.consecutiveCampaigns).toBe(3);
    expect(completed.pendingProposal).toBeUndefined();
  });
});
