/**
 * Vault tests — security-critical roundtrip, cache isolation, wrong password.
 * Tier 1: These tests protect the code paths where bugs cause the most damage.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { createTempHome, cleanupTempHome } from './helpers/temp-dir.js';

// Create temp dir BEFORE any vault import (VAULT_DIR is computed at module load)
const tempDir = await createTempHome();

vi.mock('node:os', async (importOriginal) => {
  const original = await importOriginal<typeof import('node:os')>();
  return { ...original, homedir: () => tempDir };
});

// Import after mock is set up
const vault = await import('../lib/vault.js');

const PASSWORD = 'test-vault-password-12345';

describe('vault', () => {
  beforeEach(() => {
    vault.vaultLock();
  });

  afterAll(async () => {
    vault.vaultLock();
    await cleanupTempHome(tempDir);
  });

  it('should create a new vault on first unlock', async () => {
    expect(vault.vaultExists()).toBe(false);
    const created = await vault.vaultUnlock(PASSWORD);
    expect(created).toBe(true);
  });

  it('should store and retrieve values', async () => {
    await vault.vaultSet(PASSWORD, 'api-key', 'sk-test-12345');
    const value = await vault.vaultGet(PASSWORD, 'api-key');
    expect(value).toBe('sk-test-12345');
  });

  it('should reject wrong password on existing vault', async () => {
    vault.vaultLock();
    const result = await vault.vaultUnlock('wrong-password-456789');
    expect(result).toBe(false);
  });

  it('should accept correct password after wrong attempt', async () => {
    const result = await vault.vaultUnlock(PASSWORD);
    expect(result).toBe(true);
  });

  it('should list stored keys', async () => {
    await vault.vaultSet(PASSWORD, 'key-b', 'val-b');
    const keys = await vault.vaultKeys(PASSWORD);
    expect(keys).toContain('api-key');
    expect(keys).toContain('key-b');
  });

  it('should delete keys', async () => {
    await vault.vaultSet(PASSWORD, 'to-delete', 'temp');
    await vault.vaultDelete(PASSWORD, 'to-delete');
    const value = await vault.vaultGet(PASSWORD, 'to-delete');
    expect(value).toBeNull();
  });

  it('should return shallow clone from cache (mutation does not corrupt)', async () => {
    await vault.vaultSet(PASSWORD, 'immutable', 'original');

    // Get keys and mutate the array
    const keys1 = await vault.vaultKeys(PASSWORD);
    keys1.push('injected');

    // Fresh read should not see mutation
    const keys2 = await vault.vaultKeys(PASSWORD);
    expect(keys2).not.toContain('injected');
  });

  it('should handle concurrent writes via serialized queue', async () => {
    const writes = Array.from({ length: 5 }, (_, i) =>
      vault.vaultSet(PASSWORD, `concurrent-${i}`, `value-${i}`)
    );
    await Promise.all(writes);

    const keys = await vault.vaultKeys(PASSWORD);
    for (let i = 0; i < 5; i++) {
      expect(keys).toContain(`concurrent-${i}`);
    }
  });

  it('should persist across lock/unlock cycles', async () => {
    await vault.vaultSet(PASSWORD, 'persistent', 'survives-lock');
    vault.vaultLock();

    await vault.vaultUnlock(PASSWORD);
    const value = await vault.vaultGet(PASSWORD, 'persistent');
    expect(value).toBe('survives-lock');
  });

  it('should handle unicode values', async () => {
    await vault.vaultSet(PASSWORD, 'emoji', '🔒🗝️');
    const emoji = await vault.vaultGet(PASSWORD, 'emoji');
    expect(emoji).toBe('🔒🗝️');
  });
});
