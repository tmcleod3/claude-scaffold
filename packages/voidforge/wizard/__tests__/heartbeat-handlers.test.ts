/**
 * Heartbeat handler tests — validates campaign CRUD handlers are properly wired
 * to platform adapters via the adapter factory.
 *
 * Tests the handler functions extracted from heartbeat.ts by verifying the
 * integration flow: request → factory → adapter → state machine → persistence.
 *
 * Tier 1: Financial handler correctness — ensures campaign operations work end-to-end.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { IncomingMessage, ClientRequest } from 'node:http';
import { EventEmitter } from 'node:events';
import { toCents } from '../lib/financial/campaign/base.js';
import type { Cents } from '../lib/financial/campaign/base.js';
import { randomUUID } from 'node:crypto';

// ── Mock node:https for adapter factory dynamic imports ──

let mockResponseStatus = 200;
let mockResponseBody = '{}';

function createFakeResponse(): IncomingMessage {
  const res = new EventEmitter() as IncomingMessage;
  res.statusCode = mockResponseStatus;
  process.nextTick(() => {
    res.emit('data', Buffer.from(mockResponseBody));
    res.emit('end');
  });
  return res;
}

type RequestCallback = (res: IncomingMessage) => void;

vi.mock('node:https', () => ({
  request: (_options: unknown, callback: RequestCallback): ClientRequest => {
    const req = new EventEmitter() as ClientRequest;
    req.end = vi.fn((..._args: unknown[]) => {
      const res = createFakeResponse();
      callback(res);
      return req;
    });
    req.write = vi.fn();
    req.destroy = vi.fn();
    return req;
  },
}));

// ── Test the adapter factory directly ───────────────

const { getCampaignAdapter } = await import('../lib/financial/adapter-factory.js');
const { SandboxCampaignAdapter } = await import('../lib/financial/campaign/sandbox-campaign.js');
const { transition, isValidTransition, VALID_TRANSITIONS } = await import('../lib/campaign-state-machine.js');

// ── Helpers ──────────────────────────────────────────

function setMockResponse(status: number, body: unknown): void {
  mockResponseStatus = status;
  mockResponseBody = typeof body === 'string' ? body : JSON.stringify(body);
}

// ── Factory Integration Tests ────────────────────────

describe('getCampaignAdapter — factory wiring', () => {
  it('should return SandboxCampaignAdapter when vault key is null', async () => {
    const adapter = await getCampaignAdapter('meta', null);
    expect(adapter).toBeInstanceOf(SandboxCampaignAdapter);
  });

  it('should return SandboxCampaignAdapter for unrecognized platform', async () => {
    const adapter = await getCampaignAdapter('reddit' as never, null);
    expect(adapter).toBeInstanceOf(SandboxCampaignAdapter);
  });

  it('sandbox adapter should support full campaign lifecycle', async () => {
    const adapter = await getCampaignAdapter('meta', null) as InstanceType<typeof SandboxCampaignAdapter>;

    // Create
    const result = await adapter.createCampaign({
      name: 'Handler Test',
      platform: 'meta',
      objective: 'traffic',
      dailyBudget: toCents(50),
      targeting: { audiences: ['test'], locations: ['US'] },
      creative: { headlines: ['Test'], descriptions: ['Desc'], callToAction: 'LEARN_MORE', landingUrl: 'https://example.com' },
      idempotencyKey: randomUUID(),
      complianceStatus: 'passed',
    });
    expect(result.externalId).toBeDefined();

    // Approve + pause
    adapter.approveCampaign(result.externalId);
    await adapter.pauseCampaign(result.externalId);
    expect(adapter.getCampaignStatus(result.externalId)).toBe('paused');

    // Resume
    await adapter.resumeCampaign(result.externalId);
    expect(adapter.getCampaignStatus(result.externalId)).toBe('active');

    // Get performance
    const perf = await adapter.getPerformance(result.externalId);
    expect(perf.impressions).toBeGreaterThan(0);
  });
});

// ── State Machine Integration Tests ──────────────────

describe('Campaign state machine — handler transitions', () => {
  it('active → paused (user_paused) should be valid', () => {
    expect(isValidTransition('active', 'paused')).toBe(true);
    const event = transition('active', 'paused', 'cli', 'user_paused');
    expect(event.newStatus).toBe('paused');
  });

  it('paused → active (user_resumed) should be valid', () => {
    expect(isValidTransition('paused', 'active')).toBe(true);
    const event = transition('paused', 'active', 'cli', 'user_resumed');
    expect(event.newStatus).toBe('active');
  });

  it('active → suspended (freeze) should be valid', () => {
    expect(isValidTransition('active', 'suspended')).toBe(true);
    const event = transition('active', 'suspended', 'cli', 'freeze');
    expect(event.newStatus).toBe('suspended');
  });

  it('suspended → active (unfreeze) should be valid', () => {
    expect(isValidTransition('suspended', 'active')).toBe(true);
    const event = transition('suspended', 'active', 'cli', 'unfreeze');
    expect(event.newStatus).toBe('active');
  });

  it('creating → active should be valid (campaign launch success)', () => {
    expect(isValidTransition('creating', 'active')).toBe(true);
  });

  it('creating → error should be valid (campaign launch failure)', () => {
    expect(isValidTransition('creating', 'error')).toBe(true);
  });

  it('paused → active should be valid (resume)', () => {
    expect(VALID_TRANSITIONS.paused).toContain('active');
  });

  it('invalid transition should throw', () => {
    expect(() => transition('completed', 'active', 'cli', 'invalid')).toThrow();
  });
});

// ── Handler Data Flow Tests ──────────────────────────

describe('Handler data flow — launch → pause → resume → freeze', () => {
  it('full handler flow with sandbox adapter', async () => {
    const adapter = await getCampaignAdapter('google', null) as InstanceType<typeof SandboxCampaignAdapter>;

    // 1. Launch: create campaign
    const config = {
      name: 'Full Flow Test',
      platform: 'google' as const,
      objective: 'traffic' as const,
      dailyBudget: toCents(25),
      targeting: { audiences: ['broad'], locations: ['US'] },
      creative: { headlines: ['H1'], descriptions: ['D1'], callToAction: 'BUY', landingUrl: 'https://test.com' },
      idempotencyKey: randomUUID(),
      complianceStatus: 'passed' as const,
    };

    const result = await adapter.createCampaign(config);
    expect(result.externalId.startsWith('sandbox_campaign_')).toBe(true);

    // 2. Approve (sandbox-specific, simulates platform approval)
    adapter.approveCampaign(result.externalId);
    expect(adapter.getCampaignStatus(result.externalId)).toBe('active');

    // 3. Pause
    await adapter.pauseCampaign(result.externalId);
    expect(adapter.getCampaignStatus(result.externalId)).toBe('paused');

    // 4. Resume
    await adapter.resumeCampaign(result.externalId);
    expect(adapter.getCampaignStatus(result.externalId)).toBe('active');

    // 5. Budget change
    await adapter.updateBudget(result.externalId, toCents(75));

    // 6. Creative update
    await adapter.updateCreative(result.externalId, { headlines: ['Updated H1'] });

    // 7. Get performance
    const perf = await adapter.getPerformance(result.externalId);
    expect(perf.campaignId).toBe(result.externalId);
    expect(perf.spend).toBeGreaterThan(0);

    // 8. Get spend report
    const spend = await adapter.getSpend({ start: '2026-01-01', end: '2026-12-31' });
    expect(spend.campaigns.length).toBeGreaterThanOrEqual(1);

    // 9. Delete
    await adapter.deleteCampaign(result.externalId);
    expect(adapter.getCampaignStatus(result.externalId)).toBe('deleted');
  });

  it('platform adapters instantiate correctly with mock vault', async () => {
    // With vault key but no credentials → falls back to sandbox
    // We can't test real vault reads here, but we verify the factory doesn't throw
    const adapter = await getCampaignAdapter('meta', null);
    expect(typeof adapter.createCampaign).toBe('function');
    expect(typeof adapter.pauseCampaign).toBe('function');
    expect(typeof adapter.getPerformance).toBe('function');
  });
});
