/**
 * Kongo Webhooks tests — signature verification, event parsing, router.
 */

import { describe, it, expect, vi } from 'vitest';
import { createHmac } from 'node:crypto';

import {
  verifyWebhookSignature,
  parseWebhookPayload,
  createWebhookRouter,
} from '../../lib/kongo/webhooks.js';

// ── Helpers ──────────────────────────────────────────────

const WEBHOOK_SECRET = 'whsec_test_secret_key_123';

function createSignature(body: string, secret: string, timestampSec?: number): string {
  const timestamp = timestampSec ?? Math.floor(Date.now() / 1000);
  const hash = createHmac('sha256', secret)
    .update(`${timestamp}.${body}`)
    .digest('hex');
  return `t=${timestamp},v1=${hash}`;
}

const samplePayload = JSON.stringify({
  event: 'page.completed',
  pageId: 'pg_abc123',
  data: {
    companyName: 'Acme Corp',
    status: 'READY',
    durationSec: 145,
    costUsd: 2.34,
    htmlLength: 48210,
  },
});

// ── Tests ────────────────────────────────────────────────

describe('verifyWebhookSignature', () => {
  it('accepts valid signature', () => {
    const signature = createSignature(samplePayload, WEBHOOK_SECRET);
    const result = verifyWebhookSignature(samplePayload, signature, WEBHOOK_SECRET);
    expect(result.valid).toBe(true);
    expect(result.reason).toBeUndefined();
  });

  it('rejects invalid secret', () => {
    const signature = createSignature(samplePayload, WEBHOOK_SECRET);
    const result = verifyWebhookSignature(samplePayload, signature, 'wrong_secret');
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('mismatch');
  });

  it('rejects tampered body', () => {
    const signature = createSignature(samplePayload, WEBHOOK_SECRET);
    const result = verifyWebhookSignature('{"tampered":true}', signature, WEBHOOK_SECRET);
    expect(result.valid).toBe(false);
  });

  it('rejects expired timestamp', () => {
    const fiveMinutesAgo = Math.floor(Date.now() / 1000) - 400;
    const signature = createSignature(samplePayload, WEBHOOK_SECRET, fiveMinutesAgo);
    const result = verifyWebhookSignature(samplePayload, signature, WEBHOOK_SECRET);
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('too old');
  });

  it('rejects future timestamp', () => {
    const futureTimestamp = Math.floor(Date.now() / 1000) + 3600; // 1 hour ahead
    const signature = createSignature(samplePayload, WEBHOOK_SECRET, futureTimestamp);
    const result = verifyWebhookSignature(samplePayload, signature, WEBHOOK_SECRET);
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('future');
  });

  it('rejects missing signature', () => {
    const result = verifyWebhookSignature(samplePayload, '', WEBHOOK_SECRET);
    expect(result.valid).toBe(false);
  });

  it('rejects malformed signature', () => {
    const result = verifyWebhookSignature(samplePayload, 'invalid-format', WEBHOOK_SECRET);
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('format');
  });

  it('rejects signature without correct prefixes', () => {
    const result = verifyWebhookSignature(samplePayload, 'x=123,y=abc', WEBHOOK_SECRET);
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('prefix');
  });

  it('rejects non-numeric timestamp', () => {
    const result = verifyWebhookSignature(samplePayload, 't=abc,v1=deadbeef', WEBHOOK_SECRET);
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('timestamp');
  });
});

describe('parseWebhookPayload', () => {
  it('parses valid page.completed payload', () => {
    const payload = parseWebhookPayload(samplePayload);
    expect(payload.event).toBe('page.completed');
    expect(payload.pageId).toBe('pg_abc123');
    expect(payload.data.status).toBe('READY');
    expect(payload.data.durationSec).toBe(145);
  });

  it('parses valid page.failed payload', () => {
    const failedPayload = JSON.stringify({
      event: 'page.failed',
      pageId: 'pg_fail456',
      data: {
        companyName: 'Failed Corp',
        status: 'ERROR',
        error: 'Content safety check failed',
      },
    });

    const payload = parseWebhookPayload(failedPayload);
    expect(payload.event).toBe('page.failed');
    expect(payload.data.status).toBe('ERROR');
  });

  it('throws on missing event field', () => {
    expect(() => parseWebhookPayload('{"pageId":"pg_123","data":{}}')).toThrow('missing');
  });

  it('throws on unknown event type', () => {
    const unknownEvent = JSON.stringify({
      event: 'unknown.event',
      pageId: 'pg_123',
      data: {},
    });
    expect(() => parseWebhookPayload(unknownEvent)).toThrow('Unknown webhook event');
  });

  it('throws on invalid JSON', () => {
    expect(() => parseWebhookPayload('not json')).toThrow();
  });
});

describe('createWebhookRouter', () => {
  it('routes page.completed events to handler', async () => {
    const router = createWebhookRouter();
    const handler = vi.fn().mockResolvedValue(undefined);
    router.on('page.completed', handler);

    const signature = createSignature(samplePayload, WEBHOOK_SECRET);
    await router.handle(samplePayload, signature, WEBHOOK_SECRET);

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'page.completed',
        pageId: 'pg_abc123',
      }),
    );
  });

  it('routes page.failed events to handler', async () => {
    const router = createWebhookRouter();
    const handler = vi.fn().mockResolvedValue(undefined);
    router.on('page.failed', handler);

    const failedPayload = JSON.stringify({
      event: 'page.failed',
      pageId: 'pg_fail',
      data: { companyName: 'Test', status: 'ERROR' },
    });
    const signature = createSignature(failedPayload, WEBHOOK_SECRET);

    await router.handle(failedPayload, signature, WEBHOOK_SECRET);
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('rejects invalid signatures', async () => {
    const router = createWebhookRouter();
    router.on('page.completed', vi.fn());

    await expect(
      router.handle(samplePayload, 'invalid', WEBHOOK_SECRET),
    ).rejects.toThrow('verification failed');
  });

  it('silently ignores unhandled event types', async () => {
    const router = createWebhookRouter();
    // Register handler for completed but send failed
    router.on('page.completed', vi.fn());

    const failedPayload = JSON.stringify({
      event: 'page.failed',
      pageId: 'pg_fail',
      data: { companyName: 'Test', status: 'ERROR' },
    });
    const signature = createSignature(failedPayload, WEBHOOK_SECRET);

    // Should not throw
    await router.handle(failedPayload, signature, WEBHOOK_SECRET);
  });
});
