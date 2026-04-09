/**
 * User manager tests — roles, invites, access checks.
 * Tier 1: Security-critical RBAC module.
 */

import { describe, it, expect, afterAll, vi } from 'vitest';
import { createTempHome, cleanupTempHome } from './helpers/temp-dir.js';

const tempDir = await createTempHome();

vi.mock('node:os', async (importOriginal) => {
  const original = await importOriginal<typeof import('node:os')>();
  return { ...original, homedir: () => tempDir };
});

// Mock audit-log to avoid side effects
vi.mock('../lib/audit-log.js', () => ({
  audit: vi.fn().mockResolvedValue(undefined),
}));

// Mock project-registry to avoid file I/O
vi.mock('../lib/project-registry.js', () => ({
  checkProjectAccess: vi.fn().mockResolvedValue('admin'),
}));

const userManager = await import('../lib/user-manager.js');
// createUser is NOT re-exported from user-manager — it comes from tower-auth
const towerAuth = await import('../lib/tower-auth.js');

afterAll(async () => {
  await cleanupTempHome(tempDir);
});

describe('isValidRole', () => {
  it('should accept valid roles', () => {
    expect(userManager.isValidRole('admin')).toBe(true);
    expect(userManager.isValidRole('deployer')).toBe(true);
    expect(userManager.isValidRole('viewer')).toBe(true);
  });

  it('should reject invalid roles', () => {
    expect(userManager.isValidRole('superadmin')).toBe(false);
    expect(userManager.isValidRole('')).toBe(false);
    expect(userManager.isValidRole('root')).toBe(false);
  });
});

describe('hasRole', () => {
  it('should grant admin access to everything', () => {
    const adminSession = { username: 'admin-user', role: 'admin' as const };
    expect(userManager.hasRole(adminSession, 'admin')).toBe(true);
    expect(userManager.hasRole(adminSession, 'deployer')).toBe(true);
    expect(userManager.hasRole(adminSession, 'viewer')).toBe(true);
  });

  it('should grant deployer access to deployer and viewer', () => {
    const deployerSession = { username: 'deploy-user', role: 'deployer' as const };
    expect(userManager.hasRole(deployerSession, 'admin')).toBe(false);
    expect(userManager.hasRole(deployerSession, 'deployer')).toBe(true);
    expect(userManager.hasRole(deployerSession, 'viewer')).toBe(true);
  });

  it('should grant viewer access only to viewer', () => {
    const viewerSession = { username: 'view-user', role: 'viewer' as const };
    expect(userManager.hasRole(viewerSession, 'admin')).toBe(false);
    expect(userManager.hasRole(viewerSession, 'deployer')).toBe(false);
    expect(userManager.hasRole(viewerSession, 'viewer')).toBe(true);
  });
});

describe('createUser + listUsers + getUserRole (via tower-auth)', () => {
  const username = 'testadmin';
  const password = 'secure-password-12345';

  it('should create a user with TOTP', async () => {
    const result = await towerAuth.createUser(username, password);
    expect(result.totpSecret).toBeDefined();
    expect(result.totpUri).toContain('otpauth://totp/');
  });

  it('should list the created user', async () => {
    const users = await userManager.listUsers();
    expect(users.some(u => u.username === username)).toBe(true);
  });

  it('should return the user role', async () => {
    const role = await userManager.getUserRole(username);
    expect(role).toBe('admin');
  });
});

describe('invite flow', () => {
  const adminSession = { username: 'testadmin', role: 'admin' as const };
  const viewerSession = { username: 'view-user', role: 'viewer' as const };

  it('should create an invite token (admin only)', async () => {
    const result = await userManager.createInvite('deployer', adminSession, '127.0.0.1');
    expect(result.token).toBeDefined();
    expect(typeof result.token).toBe('string');
    expect(result.token.length).toBe(64); // 32 bytes hex
    expect(result.expiresAt).toBeGreaterThan(Date.now());
  });

  it('should reject invite creation by non-admins', async () => {
    await expect(
      userManager.createInvite('viewer', viewerSession, '127.0.0.1')
    ).rejects.toThrow('Admin role required');
  });

  it('should complete an invite and create a new user', async () => {
    const invite = await userManager.createInvite('viewer', adminSession, '127.0.0.1');
    const result = await userManager.completeInvite(
      invite.token,
      'invited-viewer',
      'viewer-password-999',
      '10.0.0.1',
    );
    expect(result.role).toBe('viewer');
    expect(result.totpSecret).toBeDefined();
    expect(result.totpUri).toContain('otpauth://totp/');
  });

  it('should reject a used invite token', async () => {
    const invite = await userManager.createInvite('deployer', adminSession, '127.0.0.1');
    await userManager.completeInvite(invite.token, 'user-a', 'pass-a-12345', '10.0.0.1');

    // Same token again should fail
    await expect(
      userManager.completeInvite(invite.token, 'user-b', 'pass-b-12345', '10.0.0.1')
    ).rejects.toThrow('Invalid or expired invite');
  });
});

describe('updateUserRole', () => {
  it('should update a non-admin user role', async () => {
    // invited-viewer was created as 'viewer', change to deployer
    await userManager.updateUserRole('invited-viewer', 'deployer');
    const role = await userManager.getUserRole('invited-viewer');
    expect(role).toBe('deployer');
  });

  it('should reject demoting the last admin', async () => {
    // testadmin is the only admin
    await expect(
      userManager.updateUserRole('testadmin', 'viewer')
    ).rejects.toThrow('Cannot demote the last admin');
  });
});

describe('removeUser', () => {
  it('should remove a user', async () => {
    // Create a user to remove
    const adminSession = { username: 'testadmin', role: 'admin' as const };
    const invite = await userManager.createInvite('viewer', adminSession, '127.0.0.1');
    await userManager.completeInvite(invite.token, 'to-remove', 'remove-pass-999', '10.0.0.1');

    await userManager.removeUser('to-remove');
    const users = await userManager.listUsers();
    expect(users.some(u => u.username === 'to-remove')).toBe(false);
  });
});

describe('hasProjectAccess', () => {
  it('should check project access (mocked to admin)', async () => {
    const adminSession = { username: 'testadmin', role: 'admin' as const };
    const hasAccess = await userManager.hasProjectAccess(adminSession, 'proj-1', 'admin');
    expect(hasAccess).toBe(true);
  });
});
