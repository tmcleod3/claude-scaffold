/**
 * TOTP tests — generation, verification, replay protection, session management.
 * Tier 1: Security-critical 2FA module.
 */

import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest';
import { createTempHome, cleanupTempHome } from './helpers/temp-dir.js';

const tempDir = await createTempHome();

vi.mock('node:os', async (importOriginal) => {
  const original = await importOriginal<typeof import('node:os')>();
  return { ...original, homedir: () => tempDir, platform: () => 'linux' as NodeJS.Platform };
});

// Mock node:crypto to override scrypt with lower N (131072 exceeds forked process memory)
vi.mock('node:crypto', async (importOriginal) => {
  const original = await importOriginal<typeof import('node:crypto')>();
  return {
    ...original,
    scrypt: (password: string, salt: Buffer, keylen: number, options: Record<string, unknown>, cb: (err: Error | null, key: Buffer) => void) => {
      // Use N=1024 for tests (fast, same API)
      return original.scrypt(password, salt, keylen, { ...options, N: 1024 }, cb);
    },
  };
});

// Force file fallback (platform mocked to linux, so keychain is skipped)
const totp = await import('../lib/totp.js');

const FALLBACK_PASSWORD = 'totp-test-password-99999';

afterAll(async () => {
  await cleanupTempHome(tempDir);
});

describe('generateSecret', () => {
  it('should produce a 20-byte (160-bit) buffer', () => {
    const secret = totp.generateSecret();
    expect(Buffer.isBuffer(secret)).toBe(true);
    expect(secret.length).toBe(20);
  });

  it('should produce unique secrets on each call', () => {
    const a = totp.generateSecret();
    const b = totp.generateSecret();
    expect(a.equals(b)).toBe(false);
  });
});

describe('encodeBase32', () => {
  it('should encode a buffer to base32 string', () => {
    const secret = totp.generateSecret();
    const b32 = totp.encodeBase32(secret);
    expect(typeof b32).toBe('string');
    expect(b32.length).toBeGreaterThan(0);
    expect(/^[A-Z2-7]+$/.test(b32)).toBe(true);
  });
});

describe('generateOtpauthUri', () => {
  it('should return a valid otpauth:// URI', () => {
    const secret = totp.generateSecret();
    const uri = totp.generateOtpauthUri(secret);
    expect(uri).toMatch(/^otpauth:\/\/totp\//);
    expect(uri).toContain('issuer=VoidForge');
    expect(uri).toContain('digits=6');
    expect(uri).toContain('period=30');
  });

  it('should include custom issuer and account', () => {
    const secret = totp.generateSecret();
    const uri = totp.generateOtpauthUri(secret, 'TestCo', 'user@example.com');
    expect(uri).toContain('TestCo');
    expect(uri).toContain('user%40example.com');
  });
});

describe('totpSetup', () => {
  beforeEach(() => {
    totp.totpSessionInvalidate();
  });

  it('should set up TOTP with file fallback and return uri + secret', async () => {
    const result = await totp.totpSetup(FALLBACK_PASSWORD);
    expect(result.stored).toBe('file');
    expect(result.uri).toMatch(/^otpauth:\/\/totp\//);
    expect(result.secret.length).toBeGreaterThan(0);
    expect(/^[A-Z2-7]+$/.test(result.secret)).toBe(true);
  });

  it('should throw when keychain unavailable and no fallback password', async () => {
    await expect(totp.totpSetup()).rejects.toThrow('System keychain unavailable');
  });
});

describe('totpVerify', () => {
  beforeEach(() => {
    totp.totpSessionInvalidate();
  });

  it('should generate a valid 6-digit code that passes verification', async () => {
    // Set up TOTP first (may already be set up from previous test)
    try { await totp.totpSetup(FALLBACK_PASSWORD); } catch { /* already set up */ }

    const secret = await getStoredSecret(FALLBACK_PASSWORD);
    const step = Math.floor(Date.now() / 1000 / 30);
    const code = generateCode(secret, step);

    expect(code.length).toBe(6);
    expect(/^\d{6}$/.test(code)).toBe(true);

    const valid = await totp.totpVerify(code, FALLBACK_PASSWORD);
    expect(valid).toBe(true);
  });

  it('should reject an invalid code', async () => {
    try { await totp.totpSetup(FALLBACK_PASSWORD); } catch { /* already set up */ }
    const valid = await totp.totpVerify('000000', FALLBACK_PASSWORD);
    expect(valid).toBe(false);
  });

  it('should reject replay of the same code (same step)', async () => {
    try { await totp.totpSetup(FALLBACK_PASSWORD); } catch { /* already set up */ }

    const secret = await getStoredSecret(FALLBACK_PASSWORD);
    const step = Math.floor(Date.now() / 1000 / 30);
    const code = generateCode(secret, step);

    // First verification should pass
    const first = await totp.totpVerify(code, FALLBACK_PASSWORD);
    expect(first).toBe(true);

    // Same code, same step — replay should be rejected
    const replay = await totp.totpVerify(code, FALLBACK_PASSWORD);
    expect(replay).toBe(false);
  });
});

describe('totpSessionValid', () => {
  beforeEach(() => {
    totp.totpSessionInvalidate();
  });

  it('should return false when no session exists', () => {
    expect(totp.totpSessionValid()).toBe(false);
  });

  it('should return true after successful verification', async () => {
    try { await totp.totpSetup(FALLBACK_PASSWORD); } catch { /* already set up */ }

    const secret = await getStoredSecret(FALLBACK_PASSWORD);
    const step = Math.floor(Date.now() / 1000 / 30);
    const code = generateCode(secret, step);

    await totp.totpVerify(code, FALLBACK_PASSWORD);
    expect(totp.totpSessionValid()).toBe(true);
  });

  it('should return false after explicit invalidation', async () => {
    try { await totp.totpSetup(FALLBACK_PASSWORD); } catch { /* already set up */ }

    const secret = await getStoredSecret(FALLBACK_PASSWORD);
    const step = Math.floor(Date.now() / 1000 / 30);
    const code = generateCode(secret, step);

    await totp.totpVerify(code, FALLBACK_PASSWORD);
    totp.totpSessionInvalidate();
    expect(totp.totpSessionValid()).toBe(false);
  });
});

describe('totpIsConfigured', () => {
  it('should return true when TOTP is set up', async () => {
    try { await totp.totpSetup(FALLBACK_PASSWORD); } catch { /* already set up */ }
    const configured = await totp.totpIsConfigured(FALLBACK_PASSWORD);
    expect(configured).toBe(true);
  });
});

// ── Helpers ──────────────────────────────────────────

/** Read stored secret using file fallback (uses mocked scrypt with low N) */
async function getStoredSecret(password: string): Promise<Buffer> {
  const { readFile } = await import('node:fs/promises');
  const { join } = await import('node:path');
  const { createDecipheriv, scrypt } = await import('node:crypto');

  const fallbackPath = join(tempDir, '.voidforge', 'treasury', 'totp.enc');
  const raw = await readFile(fallbackPath);
  const salt = raw.subarray(0, 32);
  const iv = raw.subarray(32, 48);
  const tag = raw.subarray(48, 64);
  const ciphertext = raw.subarray(64);

  // Must use the 5-arg form to match the mock's signature
  const key = await new Promise<Buffer>((resolve, reject) => {
    scrypt(password.slice(0, 256), salt, 32, { N: 1024, r: 8, p: 1 }, (err: Error | null, k: Buffer) => {
      if (err) reject(err); else resolve(k);
    });
  });

  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}

/** Generate a TOTP code (mirrors the module's internal logic) */
function generateCode(secret: Buffer, step: number): string {
  const { createHmac } = require('node:crypto');
  const timeBuffer = Buffer.alloc(8);
  timeBuffer.writeBigInt64BE(BigInt(step));
  const hmac = createHmac('sha1', secret);
  hmac.update(timeBuffer);
  const hash = hmac.digest();
  const offset = hash[hash.length - 1] & 0x0f;
  const binary =
    ((hash[offset] & 0x7f) << 24) |
    ((hash[offset + 1] & 0xff) << 16) |
    ((hash[offset + 2] & 0xff) << 8) |
    (hash[offset + 3] & 0xff);
  const otp = binary % Math.pow(10, 6);
  return otp.toString().padStart(6, '0');
}
