/**
 * Treasury backup tests — encrypted backup creation, file existence, pruning.
 * Tier 1: Financial data protection module.
 */

import { describe, it, expect, afterAll, vi } from 'vitest';
import { createTempHome, cleanupTempHome } from './helpers/temp-dir.js';
import { mkdir, writeFile, readdir, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { existsSync } from 'node:fs';

const tempDir = await createTempHome();

vi.mock('node:os', async (importOriginal) => {
  const original = await importOriginal<typeof import('node:os')>();
  return { ...original, homedir: () => tempDir };
});

// Mock node:crypto to override scrypt with lower N (131072 exceeds forked process memory)
vi.mock('node:crypto', async (importOriginal) => {
  const original = await importOriginal<typeof import('node:crypto')>();
  return {
    ...original,
    scrypt: (password: string | Buffer, salt: Buffer, keylen: number, options: Record<string, unknown>, cb: (err: Error | null, key: Buffer) => void) => {
      return original.scrypt(password, salt, keylen, { ...options, N: 1024 }, cb);
    },
  };
});

const backup = await import('../lib/treasury-backup.js');

const VAULT_PASSWORD = 'backup-test-password-12345';
const TREASURY_DIR = join(tempDir, '.voidforge', 'treasury');
const BACKUP_DIR = join(tempDir, '.voidforge', 'backups');

afterAll(async () => {
  await cleanupTempHome(tempDir);
});

describe('createDailyBackup', () => {
  it('should return empty when treasury directory has no files', async () => {
    const result = await backup.createDailyBackup(VAULT_PASSWORD);
    expect(result.files).toBe(0);
    expect(result.path).toBe('');
  });

  it('should create an encrypted backup file with .enc extension', async () => {
    // Set up a mock treasury directory with test files
    await mkdir(TREASURY_DIR, { recursive: true });
    await writeFile(join(TREASURY_DIR, 'ledger.json'), JSON.stringify({ entries: [] }));
    await writeFile(join(TREASURY_DIR, 'config.json'), JSON.stringify({ version: 1 }));

    const result = await backup.createDailyBackup(VAULT_PASSWORD);
    expect(result.files).toBe(2);
    expect(result.path).toMatch(/\.backup\.enc$/);
    expect(existsSync(result.path)).toBe(true);
  });

  it('should skip backup if today already has one', async () => {
    // Second call same day should return 0 files (already exists)
    const result = await backup.createDailyBackup(VAULT_PASSWORD);
    expect(result.files).toBe(0);
    // Path is still set (it found the existing backup)
    expect(result.path).toMatch(/\.backup\.enc$/);
  });

  it('should include subdirectory files in backup', async () => {
    // Delete existing backup to force a new one
    if (existsSync(BACKUP_DIR)) {
      const entries = await readdir(BACKUP_DIR);
      for (const entry of entries) {
        await unlink(join(BACKUP_DIR, entry));
      }
    }

    // Add a subdirectory with files
    const subDir = join(TREASURY_DIR, 'reports');
    await mkdir(subDir, { recursive: true });
    await writeFile(join(subDir, 'report-2024.json'), '{"revenue": 100}');

    const result = await backup.createDailyBackup(VAULT_PASSWORD);
    expect(result.files).toBe(3); // 2 original + 1 in subdirectory
  });

  it('should produce an encrypted file (not plain JSON)', async () => {
    const { readFile: readFileAsync } = await import('node:fs/promises');
    const entries = await readdir(BACKUP_DIR);
    const backupFile = entries.find(e => e.endsWith('.backup.enc'));
    expect(backupFile).toBeDefined();

    const content = await readFileAsync(join(BACKUP_DIR, backupFile!));

    // Encrypted content should NOT start with { (JSON) or [ (array)
    const firstChar = String.fromCharCode(content[0]);
    expect(firstChar).not.toBe('{');
    expect(firstChar).not.toBe('[');

    // Should have salt (32) + iv (16) + authTag (16) = 64 bytes minimum header
    expect(content.length).toBeGreaterThan(64);
  });
});

describe('pruneOldBackups', () => {
  it('should remove backups older than 30 days', async () => {
    await mkdir(BACKUP_DIR, { recursive: true });

    // Old backup (60 days ago)
    const oldDate = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const oldBackupPath = join(BACKUP_DIR, `treasury-${oldDate}.backup.enc`);
    await writeFile(oldBackupPath, 'fake-old-backup-data');
    expect(existsSync(oldBackupPath)).toBe(true);

    // Recent backup (5 days ago)
    const recentDate = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const recentBackupPath = join(BACKUP_DIR, `treasury-${recentDate}.backup.enc`);
    await writeFile(recentBackupPath, 'fake-recent-backup-data');

    // Delete today's backup so createDailyBackup runs (and triggers prune)
    const todayDate = new Date().toISOString().split('T')[0];
    const todayPath = join(BACKUP_DIR, `treasury-${todayDate}.backup.enc`);
    if (existsSync(todayPath)) {
      await unlink(todayPath);
    }

    // createDailyBackup internally calls pruneOldBackups
    await backup.createDailyBackup(VAULT_PASSWORD);

    // Old backup should be pruned
    expect(existsSync(oldBackupPath)).toBe(false);
    // Recent backup should remain
    expect(existsSync(recentBackupPath)).toBe(true);
  });
});

describe('exportTreasuryData', () => {
  it('should export treasury data to the specified path', async () => {
    const exportPath = join(tempDir, 'export-test.enc');

    // Delete today's backup first so export creates a fresh one
    const todayDate = new Date().toISOString().split('T')[0];
    const todayPath = join(BACKUP_DIR, `treasury-${todayDate}.backup.enc`);
    if (existsSync(todayPath)) {
      await unlink(todayPath);
    }

    await backup.exportTreasuryData(VAULT_PASSWORD, exportPath);
    expect(existsSync(exportPath)).toBe(true);
  });
});
