/**
 * Audit log tests — append-only JSON lines logging with 7-rotation scheme.
 * Tier 2: Security audit trail — ensures tamper-visible logging and rotation.
 */

import { describe, it, expect, vi, afterAll, beforeEach } from 'vitest';
import { join } from 'node:path';
import { readFile, rm, stat as fsStat, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { createTempHome, cleanupTempHome } from './helpers/temp-dir.js';

// Create temp dir BEFORE import
const tempDir = await createTempHome();
const VOIDFORGE_DIR = join(tempDir, '.voidforge');
const LOG_PATH = join(VOIDFORGE_DIR, 'audit.log');

vi.mock('node:os', async (importOriginal) => {
  const original = await importOriginal<typeof import('node:os')>();
  return { ...original, homedir: () => tempDir };
});

// Import after mock is set up
const { audit, initAuditLog } = await import('../lib/audit-log.js');

// ── Cleanup ───────────────────────────────────────────

afterAll(async () => {
  await cleanupTempHome(tempDir);
});

beforeEach(async () => {
  // Clean the log directory between tests (but keep .voidforge dir)
  for (let i = 0; i <= 7; i++) {
    const suffix = i === 0 ? '' : `.${i}`;
    const path = LOG_PATH + suffix;
    if (existsSync(path)) {
      await rm(path, { force: true });
    }
  }
});

// ── Tests ─────────────────────────────────────────────

describe('audit()', () => {
  it('should write a JSON line to the log file', async () => {
    await audit('login_success', '127.0.0.1', 'test-user', { method: 'totp' });

    expect(existsSync(LOG_PATH)).toBe(true);

    const content = await readFile(LOG_PATH, 'utf-8');
    const lines = content.trim().split('\n');
    expect(lines).toHaveLength(1);

    const entry = JSON.parse(lines[0]);
    expect(entry.event).toBe('login_success');
    expect(entry.ip).toBe('127.0.0.1');
    expect(entry.user).toBe('test-user');
    expect(entry.details).toEqual({ method: 'totp' });
    expect(entry.timestamp).toBeDefined();
    // Timestamp should be valid ISO 8601
    expect(new Date(entry.timestamp).toISOString()).toBe(entry.timestamp);
  });

  it('should append multiple entries as separate JSON lines', async () => {
    await audit('login_attempt', '10.0.0.1', 'user-a');
    await audit('login_success', '10.0.0.1', 'user-a');
    await audit('vault_unlock', '10.0.0.1', 'user-a', { vault: 'financial' });

    const content = await readFile(LOG_PATH, 'utf-8');
    const lines = content.trim().split('\n');
    expect(lines).toHaveLength(3);

    expect(JSON.parse(lines[0]).event).toBe('login_attempt');
    expect(JSON.parse(lines[1]).event).toBe('login_success');
    expect(JSON.parse(lines[2]).event).toBe('vault_unlock');
  });

  it('should never throw even on write failure', async () => {
    // Trigger a write failure by making the log path a directory
    // (appendFile to a directory path will fail)
    const { mkdir: mkdirFs } = await import('node:fs/promises');
    await mkdirFs(LOG_PATH, { recursive: true });

    // Should NOT throw
    await expect(audit('deploy', '10.0.0.1', 'deploy-bot')).resolves.not.toThrow();

    // Clean up — remove the directory so other tests can write files
    await rm(LOG_PATH, { recursive: true, force: true });
  });

  it('should write valid JSON on each line (no partial writes)', async () => {
    // Write several entries rapidly
    const promises = [];
    for (let i = 0; i < 10; i++) {
      promises.push(audit('session_create', '10.0.0.1', `user-${i}`));
    }
    await Promise.all(promises);

    const content = await readFile(LOG_PATH, 'utf-8');
    const lines = content.trim().split('\n');

    // Every line should be valid JSON
    for (const line of lines) {
      expect(() => JSON.parse(line)).not.toThrow();
    }
  });
});

describe('rotation', () => {
  it('should trigger rotation when file exceeds 10MB', async () => {
    // Use the real stat but create a file > 10MB
    const { mkdir: mkdirFs } = await import('node:fs/promises');
    await mkdirFs(VOIDFORGE_DIR, { recursive: true });

    // Write a file just over 10MB
    const bigContent = 'x'.repeat(10 * 1024 * 1024 + 1);
    await writeFile(LOG_PATH, bigContent);

    // Verify it's actually big
    const stats = await fsStat(LOG_PATH);
    expect(stats.size).toBeGreaterThan(10 * 1024 * 1024);

    // This audit call should trigger rotation
    await audit('login_success', '10.0.0.1', 'rotation-test');

    // The old file should now be at .1
    expect(existsSync(LOG_PATH + '.1')).toBe(true);

    // The current log should have just the new entry
    const currentContent = await readFile(LOG_PATH, 'utf-8');
    const entry = JSON.parse(currentContent.trim());
    expect(entry.event).toBe('login_success');
    expect(entry.user).toBe('rotation-test');

    // The rotated file should contain the big content
    const rotatedContent = await readFile(LOG_PATH + '.1', 'utf-8');
    expect(rotatedContent.length).toBeGreaterThan(10 * 1024 * 1024);
  });

  it('should cascade rotations .1->.2, .2->.3 etc.', async () => {
    const { mkdir: mkdirFs } = await import('node:fs/promises');
    await mkdirFs(VOIDFORGE_DIR, { recursive: true });

    // Pre-populate rotated files .1 through .5
    for (let i = 1; i <= 5; i++) {
      await writeFile(LOG_PATH + '.' + i, `rotated-content-${i}`);
    }

    // Create a big current log to trigger rotation
    const bigContent = 'y'.repeat(10 * 1024 * 1024 + 1);
    await writeFile(LOG_PATH, bigContent);

    // Trigger rotation via audit
    await audit('deploy', '10.0.0.1', 'cascade-test');

    // Check cascade: old .5 should now be at .6
    expect(existsSync(LOG_PATH + '.6')).toBe(true);
    const content6 = await readFile(LOG_PATH + '.6', 'utf-8');
    expect(content6).toBe('rotated-content-5');

    // Old .1 should now be at .2
    expect(existsSync(LOG_PATH + '.2')).toBe(true);
    const content2 = await readFile(LOG_PATH + '.2', 'utf-8');
    expect(content2).toBe('rotated-content-1');

    // New .1 should be the big file
    expect(existsSync(LOG_PATH + '.1')).toBe(true);
    const content1 = await readFile(LOG_PATH + '.1', 'utf-8');
    expect(content1.length).toBeGreaterThan(10 * 1024 * 1024);

    // Current log should have the new entry
    const currentContent = await readFile(LOG_PATH, 'utf-8');
    expect(JSON.parse(currentContent.trim()).user).toBe('cascade-test');
  });

  it('should not rotate when file is under 10MB', async () => {
    const { mkdir: mkdirFs } = await import('node:fs/promises');
    await mkdirFs(VOIDFORGE_DIR, { recursive: true });

    // Write a small file
    await writeFile(LOG_PATH, 'small content\n');

    await audit('login_attempt', '10.0.0.1', 'small-test');

    // No rotation should occur
    expect(existsSync(LOG_PATH + '.1')).toBe(false);

    // Current log should have both the original content and the new entry
    const content = await readFile(LOG_PATH, 'utf-8');
    expect(content).toContain('small content');
    expect(content).toContain('small-test');
  });
});
