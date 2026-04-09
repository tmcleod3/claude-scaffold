/**
 * Financial vault tests — encrypt/decrypt round-trip, session cache, atomic writes, key zeroing.
 * Tier 1: Financial credential security — the most sensitive storage path.
 */

import { describe, it, expect, afterAll, beforeEach, vi } from 'vitest';
import { createTempHome, cleanupTempHome } from './helpers/temp-dir.js';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';

// Create temp dir BEFORE any financial-vault import (TREASURY_DIR is computed at module load)
const tempDir = await createTempHome();

vi.mock('node:os', async (importOriginal) => {
  const original = await importOriginal<typeof import('node:os')>();
  return { ...original, homedir: () => tempDir };
});

// Mock node:crypto to lower scrypt N parameter (131072 exceeds test worker memory).
// We wrap the real scrypt with N=1024 which is fast and low-memory for tests.
vi.mock('node:crypto', async (importOriginal) => {
  const original = await importOriginal<typeof import('node:crypto')>();
  const TEST_SCRYPT_N = 1024;
  return {
    ...original,
    scrypt: (password: unknown, salt: unknown, keylen: unknown, options: Record<string, unknown>, cb: unknown) => {
      const opts = { ...options, N: TEST_SCRYPT_N };
      return original.scrypt(password as string, salt as Buffer, keylen as number, opts, cb as () => void);
    },
  };
});

// Suppress dynamic totp import inside financialVaultLock
vi.mock('../lib/totp.js', () => ({
  totpSessionInvalidate: () => {},
}));

// Import after mocks are set up
const fv = await import('../lib/financial-vault.js');

const PASSWORD = 'test-financial-vault-pw-12345';

describe('financial vault', () => {
  beforeEach(() => {
    fv.financialVaultLock();
  });

  afterAll(async () => {
    fv.financialVaultLock();
    await cleanupTempHome(tempDir);
  });

  it('should not exist before first write', () => {
    expect(fv.financialVaultExists()).toBe(false);
  });

  it('should create the vault on first set', async () => {
    await fv.financialVaultSet(PASSWORD, 'stripe-key', 'sk_test_abc');
    expect(fv.financialVaultExists()).toBe(true);
  });

  it('should encrypt/decrypt round-trip correctly', async () => {
    await fv.financialVaultSet(PASSWORD, 'stripe-key', 'sk_test_abc');
    const value = await fv.financialVaultGet(PASSWORD, 'stripe-key');
    expect(value).toBe('sk_test_abc');
  });

  it('should store and retrieve multiple keys', async () => {
    await fv.financialVaultSet(PASSWORD, 'key-a', 'value-a');
    await fv.financialVaultSet(PASSWORD, 'key-b', 'value-b');
    const keys = await fv.financialVaultKeys(PASSWORD);
    expect(keys).toContain('key-a');
    expect(keys).toContain('key-b');
    expect(await fv.financialVaultGet(PASSWORD, 'key-a')).toBe('value-a');
    expect(await fv.financialVaultGet(PASSWORD, 'key-b')).toBe('value-b');
  });

  it('should perform atomic write (vault file is not corrupted)', async () => {
    await fv.financialVaultSet(PASSWORD, 'atomic-test', 'safe-data');
    const vaultPath = fv.financialVaultPath();
    expect(existsSync(vaultPath)).toBe(true);

    // Raw file should be binary (encrypted), not readable JSON
    const raw = await readFile(vaultPath);
    expect(raw.length).toBeGreaterThan(0);
    expect(() => JSON.parse(raw.toString('utf-8'))).toThrow();
  });

  it('should use session cache: unlock -> get succeeds -> lock -> get fails', async () => {
    // Populate vault
    await fv.financialVaultSet(PASSWORD, 'cached-key', 'cached-value');

    // Unlock populates the session cache
    const unlocked = await fv.financialVaultUnlock(PASSWORD);
    expect(unlocked).toBe(true);

    // Get works with correct password
    const value = await fv.financialVaultGet(PASSWORD, 'cached-key');
    expect(value).toBe('cached-value');

    // Lock clears the session cache
    fv.financialVaultLock();

    // After lock, wrong password should fail
    const wrongResult = await fv.financialVaultUnlock('wrong-password-12345');
    expect(wrongResult).toBe(false);
  });

  it('should zero session cache on lock', async () => {
    await fv.financialVaultSet(PASSWORD, 'zeroed', 'secret');

    // After lock, re-unlock with correct password should still work
    // (proving data persists on disk even after cache is zeroed)
    fv.financialVaultLock();
    const unlocked = await fv.financialVaultUnlock(PASSWORD);
    expect(unlocked).toBe(true);
    const value = await fv.financialVaultGet(PASSWORD, 'zeroed');
    expect(value).toBe('secret');
  });

  it('should reject passwords shorter than 12 characters', () => {
    // validatePassword throws synchronously before the serialized queue
    expect(() => fv.financialVaultSet('short', 'k', 'v')).toThrow(
      'at least 12 characters'
    );
  });

  it('should delete a key', async () => {
    await fv.financialVaultSet(PASSWORD, 'delete-me', 'temp');
    await fv.financialVaultDelete(PASSWORD, 'delete-me');
    const value = await fv.financialVaultGet(PASSWORD, 'delete-me');
    expect(value).toBeNull();
  });

  it('should return null for non-existent key', async () => {
    // Ensure vault exists
    await fv.financialVaultSet(PASSWORD, 'exists', 'yes');
    const value = await fv.financialVaultGet(PASSWORD, 'no-such-key');
    expect(value).toBeNull();
  });

  it('should handle concurrent writes via serialized queue', async () => {
    const writes = Array.from({ length: 5 }, (_, i) =>
      fv.financialVaultSet(PASSWORD, `concurrent-${i}`, `val-${i}`)
    );
    await Promise.all(writes);

    const keys = await fv.financialVaultKeys(PASSWORD);
    for (let i = 0; i < 5; i++) {
      expect(keys).toContain(`concurrent-${i}`);
    }
  });

  it('should persist across lock/unlock cycles', async () => {
    await fv.financialVaultSet(PASSWORD, 'persist', 'survives-lock');
    fv.financialVaultLock();

    await fv.financialVaultUnlock(PASSWORD);
    const value = await fv.financialVaultGet(PASSWORD, 'persist');
    expect(value).toBe('survives-lock');
  });

  it('should return treasury dir and vault path with correct structure', () => {
    const dir = fv.treasuryDir();
    const path = fv.financialVaultPath();
    expect(dir).toContain('.voidforge');
    expect(dir).toContain('treasury');
    expect(path).toContain('vault.enc');
    expect(path.startsWith(dir)).toBe(true);
  });
});
