/**
 * Kongo Webhooks — Signature verification and event routing.
 *
 * Kongo sends webhooks for page.completed and page.failed events
 * via the callbackUrl specified on page creation.
 *
 * Signature format: X-Kongo-Signature: t=timestamp,v1=signature
 * Verification: HMAC-SHA256 of "timestamp.body" with webhook signing secret.
 *
 * PRD Reference: PRD-kongo-integration.md §4.3, §11
 */

import { createHmac, timingSafeEqual } from 'node:crypto';

import type { WebhookPayload, WebhookEventType } from './types.js';

// ── Signature Verification ───────────────────────────────

// Maximum age for webhook timestamp (5 minutes)
const MAX_WEBHOOK_AGE_MS = 5 * 60 * 1000;
// Maximum webhook body size (1 MB — defense in depth, HTTP layer should also limit)
const MAX_WEBHOOK_BODY_BYTES = 1 * 1024 * 1024;

export interface WebhookVerificationResult {
  readonly valid: boolean;
  readonly reason?: string;
}

/**
 * Verify a Kongo webhook signature.
 *
 * Uses timing-safe comparison to prevent timing attacks.
 * Rejects replayed webhooks older than 5 minutes.
 *
 * @param rawBody - The raw request body as a string (must not be parsed)
 * @param signature - The X-Kongo-Signature header value
 * @param secret - The webhook signing secret from vault
 */
export function verifyWebhookSignature(
  rawBody: string,
  signature: string,
  secret: string,
): WebhookVerificationResult {
  if (!signature || !rawBody || !secret) {
    return { valid: false, reason: 'Missing signature, body, or secret' };
  }

  if (Buffer.byteLength(rawBody) > MAX_WEBHOOK_BODY_BYTES) {
    return { valid: false, reason: 'Webhook body too large' };
  }

  // Parse signature: t=timestamp,v1=hash
  const parts = signature.split(',');
  if (parts.length !== 2) {
    return { valid: false, reason: 'Invalid signature format' };
  }

  const tPart = parts[0];
  const vPart = parts[1];

  if (!tPart.startsWith('t=') || !vPart.startsWith('v1=')) {
    return { valid: false, reason: 'Invalid signature format: missing t= or v1= prefix' };
  }

  const timestamp = tPart.slice(2);
  const providedHash = vPart.slice(3);

  // Check timestamp freshness
  const timestampMs = parseInt(timestamp, 10) * 1000;
  if (isNaN(timestampMs)) {
    return { valid: false, reason: 'Invalid timestamp' };
  }

  const age = Date.now() - timestampMs;
  if (age < -60_000) {
    return { valid: false, reason: 'Webhook timestamp is in the future' };
  }
  if (age > MAX_WEBHOOK_AGE_MS) {
    return { valid: false, reason: `Webhook too old: ${Math.round(age / 1000)}s (max ${MAX_WEBHOOK_AGE_MS / 1000}s)` };
  }

  // Compute expected signature
  const payload = `${timestamp}.${rawBody}`;
  const expectedHash = createHmac('sha256', secret)
    .update(payload)
    .digest('hex');

  // Timing-safe comparison
  const providedBuf = Buffer.from(providedHash, 'hex');
  const expectedBuf = Buffer.from(expectedHash, 'hex');

  if (providedBuf.length !== expectedBuf.length) {
    return { valid: false, reason: 'Signature length mismatch' };
  }

  const valid = timingSafeEqual(providedBuf, expectedBuf);
  return valid ? { valid: true } : { valid: false, reason: 'Signature mismatch' };
}

// ── Event Parsing ────────────────────────────────────────

/**
 * Parse a verified webhook body into a typed payload.
 */
export function parseWebhookPayload(rawBody: string): WebhookPayload {
  const parsed = JSON.parse(rawBody) as WebhookPayload;

  if (!parsed.event || !parsed.pageId || !parsed.data) {
    throw new Error('Invalid webhook payload: missing event, pageId, or data');
  }

  const validEvents: WebhookEventType[] = ['page.completed', 'page.failed'];
  if (!validEvents.includes(parsed.event)) {
    throw new Error(`Unknown webhook event type: ${parsed.event}`);
  }

  return parsed;
}

// ── Event Router ─────────────────────────────────────────

export type WebhookHandler = (payload: WebhookPayload) => Promise<void>;

export interface WebhookRouter {
  readonly handlers: Map<WebhookEventType, WebhookHandler>;
  on(event: WebhookEventType, handler: WebhookHandler): void;
  handle(rawBody: string, signature: string, secret: string): Promise<void>;
}

/**
 * Create a webhook router that verifies signatures and routes events to handlers.
 */
export function createWebhookRouter(): WebhookRouter {
  const handlers = new Map<WebhookEventType, WebhookHandler>();

  return {
    handlers,

    on(event: WebhookEventType, handler: WebhookHandler) {
      handlers.set(event, handler);
    },

    async handle(rawBody: string, signature: string, secret: string) {
      const verification = verifyWebhookSignature(rawBody, signature, secret);
      if (!verification.valid) {
        throw new Error(`Webhook verification failed: ${verification.reason}`);
      }

      const payload = parseWebhookPayload(rawBody);
      const handler = handlers.get(payload.event);

      if (!handler) {
        // Log but don't throw — unknown event types should be ignored gracefully
        return;
      }

      await handler(payload);
    },
  };
}
