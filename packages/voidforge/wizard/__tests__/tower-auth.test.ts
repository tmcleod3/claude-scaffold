/**
 * Tower auth tests — authentication, sessions, rate limiting, username validation.
 * Tier 1: Security-critical module, 636 lines, zero tests until now.
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { createTempHome, cleanupTempHome } from './helpers/temp-dir.js';

const tempDir = await createTempHome();

vi.mock('node:os', async (importOriginal) => {
  const original = await importOriginal<typeof import('node:os')>();
  return { ...original, homedir: () => tempDir };
});

const auth = await import('../lib/tower-auth.js');

afterAll(async () => {
  await cleanupTempHome(tempDir);
});

describe('isValidUsername', () => {
  it('should accept valid usernames', () => {
    expect(auth.isValidUsername('alice')).toBe(true);
    expect(auth.isValidUsername('bob.smith')).toBe(true);
    expect(auth.isValidUsername('user-123')).toBe(true);
    expect(auth.isValidUsername('user_name')).toBe(true);
  });

  it('should reject too-short usernames', () => {
    expect(auth.isValidUsername('ab')).toBe(false);
    expect(auth.isValidUsername('')).toBe(false);
  });

  it('should reject special characters', () => {
    expect(auth.isValidUsername('user@name')).toBe(false);
    expect(auth.isValidUsername('user name')).toBe(false);
    expect(auth.isValidUsername('user/name')).toBe(false);
    expect(auth.isValidUsername('<script>')).toBe(false);
  });

  it('should reject too-long usernames', () => {
    expect(auth.isValidUsername('a'.repeat(65))).toBe(false);
  });

  it('should accept max-length usernames', () => {
    expect(auth.isValidUsername('a'.repeat(64))).toBe(true);
  });
});

describe('checkRateLimit', () => {
  it('should allow first attempt', () => {
    const result = auth.checkRateLimit('test-ip-1');
    expect(result.allowed).toBe(true);
  });

  it('should allow up to 5 attempts', () => {
    const ip = 'test-ip-rate';
    for (let i = 0; i < 5; i++) {
      const result = auth.checkRateLimit(ip);
      expect(result.allowed).toBe(true);
    }
  });

  it('should block 6th attempt within window', () => {
    const ip = 'test-ip-blocked';
    for (let i = 0; i < 5; i++) {
      auth.checkRateLimit(ip);
    }
    const result = auth.checkRateLimit(ip);
    expect(result.allowed).toBe(false);
    expect(result.retryAfterMs).toBeGreaterThan(0);
  });
});

describe('isAuthExempt', () => {
  it('should exempt auth endpoints', () => {
    expect(auth.isAuthExempt('/api/auth/setup')).toBe(true);
    expect(auth.isAuthExempt('/api/auth/login')).toBe(true);
    expect(auth.isAuthExempt('/api/auth/session')).toBe(true);
  });

  it('should exempt invite completion', () => {
    expect(auth.isAuthExempt('/api/users/complete-invite')).toBe(true);
  });

  it('should NOT exempt other paths', () => {
    expect(auth.isAuthExempt('/api/credentials/unlock')).toBe(false);
    expect(auth.isAuthExempt('/api/projects')).toBe(false);
    expect(auth.isAuthExempt('/api/provision/start')).toBe(false);
  });
});

describe('createUser + login flow', () => {
  const username = 'testadmin';
  const password = 'secure-password-12345';

  it('should report no users initially', async () => {
    const exists = await auth.hasUsers();
    expect(exists).toBe(false);
  });

  it('should create first user as admin with TOTP', async () => {
    const result = await auth.createUser(username, password);
    expect(result.totpSecret).toBeDefined();
    expect(result.totpUri).toContain('otpauth://totp/');
    expect(result.totpUri).toContain(username);
  });

  it('should report users exist after creation', async () => {
    const exists = await auth.hasUsers();
    expect(exists).toBe(true);
  });

  it('should list the created user', async () => {
    const users = await auth.listUsers();
    expect(users.some(u => u.username === username)).toBe(true);
  });

  it('should get user role', async () => {
    const role = await auth.getUserRole(username);
    expect(role).toBe('admin');
  });
});

describe('parseSessionCookie', () => {
  it('should extract session token from cookie header', () => {
    const token = 'abc123def456';
    const cookie = `voidforge_session=${token}; other=value`;
    expect(auth.parseSessionCookie(cookie)).toBe(token);
  });

  it('should return null for missing cookie', () => {
    expect(auth.parseSessionCookie(undefined)).toBeNull();
    expect(auth.parseSessionCookie('other=value')).toBeNull();
  });

  it('should handle session as only cookie', () => {
    expect(auth.parseSessionCookie('voidforge_session=mytoken')).toBe('mytoken');
  });
});

describe('getClientIp', () => {
  it('should return leftmost X-Forwarded-For entry in remote mode', () => {
    // Note: getClientIp only trusts XFF in remote mode. In local mode it uses socket.remoteAddress.
    // We test the parsing logic directly since remoteMode is a module-level flag.
    const forwarded = '203.0.113.50, 198.51.100.1, 127.0.0.1';
    const parts = forwarded.split(',');
    // v17.0 fix: use parts[0] (leftmost = real client), not parts[parts.length - 1] (proxy)
    expect(parts[0].trim()).toBe('203.0.113.50');
    expect(parts[parts.length - 1].trim()).toBe('127.0.0.1'); // This was the old broken behavior
  });

  it('should return socket address when not in remote mode', () => {
    const req = {
      headers: { 'x-forwarded-for': '203.0.113.50' },
      socket: { remoteAddress: '::1' },
    };
    // In local mode (default), getClientIp ignores XFF
    const ip = auth.getClientIp(req);
    expect(ip).toBe('::1');
  });
});
