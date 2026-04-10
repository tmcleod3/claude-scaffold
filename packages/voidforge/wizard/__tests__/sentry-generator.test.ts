/**
 * Sentry generator tests — framework-aware config generation.
 * Mocks filesystem to avoid writing real files.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('node:fs/promises', async (importOriginal) => {
  const original = await importOriginal<typeof import('node:fs/promises')>();
  return { ...original, writeFile: vi.fn(async () => {}), readFile: vi.fn(async () => ''), chmod: vi.fn(async () => {}) };
});

vi.mock('../lib/env-writer.js', () => ({
  appendEnvSection: vi.fn(async () => {}),
}));

const { generateSentryInit } = await import('../lib/sentry-generator.js');
const { appendEnvSection } = await import('../lib/env-writer.js');

beforeEach(() => {
  vi.clearAllMocks();
});

describe('generateSentryInit', () => {
  const emit = vi.fn();

  it('skips when no DSN provided', async () => {
    const result = await generateSentryInit('/tmp/project', 'express', undefined, emit);
    expect(result.success).toBe(true);
    expect(result.file).toBeUndefined();
    expect(emit).toHaveBeenCalledWith(expect.objectContaining({ status: 'skipped' }));
  });

  it('generates Next.js sentry config', async () => {
    const result = await generateSentryInit('/tmp/project', 'next.js', 'https://sentry.io/dsn', emit);
    expect(result.success).toBe(true);
    expect(result.file).toBe('sentry.client.config.ts');
    expect(result.pkg).toBe('@sentry/nextjs');
  });

  it('generates Express/Node sentry config', async () => {
    const result = await generateSentryInit('/tmp/project', 'express', 'https://sentry.io/dsn', emit);
    expect(result.success).toBe(true);
    expect(result.file).toBe('sentry.ts');
    expect(result.pkg).toBe('@sentry/node');
  });

  it('generates Django sentry config', async () => {
    const result = await generateSentryInit('/tmp/project', 'django', 'https://sentry.io/dsn', emit);
    expect(result.success).toBe(true);
    expect(result.file).toBe('sentry_config.py');
    expect(result.pkg).toBe('sentry-sdk[django]');
  });

  it('generates Flask sentry config', async () => {
    const result = await generateSentryInit('/tmp/project', 'flask', 'https://sentry.io/dsn', emit);
    expect(result.success).toBe(true);
    expect(result.file).toBe('sentry_config.py');
    expect(result.pkg).toBe('sentry-sdk[flask]');
  });

  it('writes SENTRY_DSN to .env', async () => {
    await generateSentryInit('/tmp/project', 'express', 'https://sentry.io/dsn-123', emit);
    expect(appendEnvSection).toHaveBeenCalledWith('/tmp/project', expect.arrayContaining([
      expect.stringContaining('SENTRY_DSN=https://sentry.io/dsn-123'),
    ]));
  });
});
