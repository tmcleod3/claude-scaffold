/**
 * Network utility tests — private IP detection is a security boundary for LAN mode.
 * Tier 2: Pure functions, easy wins, high value.
 */

import { describe, it, expect } from 'vitest';
import { isPrivateIp, isPrivateOrigin } from '../lib/network.js';

describe('isPrivateIp', () => {
  // RFC 1918 — Class A
  it('should detect 10.x.x.x as private', () => {
    expect(isPrivateIp('10.0.0.1')).toBe(true);
    expect(isPrivateIp('10.255.255.255')).toBe(true);
  });

  // RFC 1918 — Class B
  it('should detect 172.16-31.x.x as private', () => {
    expect(isPrivateIp('172.16.0.1')).toBe(true);
    expect(isPrivateIp('172.31.255.255')).toBe(true);
  });

  it('should NOT detect 172.32.x.x as private', () => {
    expect(isPrivateIp('172.32.0.1')).toBe(false);
  });

  it('should NOT detect 172.15.x.x as private', () => {
    expect(isPrivateIp('172.15.255.255')).toBe(false);
  });

  // RFC 1918 — Class C
  it('should detect 192.168.x.x as private', () => {
    expect(isPrivateIp('192.168.0.1')).toBe(true);
    expect(isPrivateIp('192.168.255.255')).toBe(true);
  });

  // Loopback
  it('should detect loopback as private', () => {
    expect(isPrivateIp('127.0.0.1')).toBe(true);
    expect(isPrivateIp('127.255.255.255')).toBe(true);
    expect(isPrivateIp('::1')).toBe(true);
  });

  // CGNAT / Tailscale
  it('should detect CGNAT range (100.64-127.x.x) as private', () => {
    expect(isPrivateIp('100.64.0.1')).toBe(true);
    expect(isPrivateIp('100.127.255.255')).toBe(true);
  });

  it('should NOT detect 100.128.x.x as private', () => {
    expect(isPrivateIp('100.128.0.1')).toBe(false);
  });

  // Link-local — not covered by current implementation (LAN mode doesn't need it)
  it('should not detect link-local (not in current implementation)', () => {
    expect(isPrivateIp('169.254.0.1')).toBe(false);
  });

  // Public IPs
  it('should NOT detect public IPs as private', () => {
    expect(isPrivateIp('8.8.8.8')).toBe(false);
    expect(isPrivateIp('1.1.1.1')).toBe(false);
    expect(isPrivateIp('203.0.113.1')).toBe(false);
  });

  // IPv6
  it('should detect IPv6 ULA as private', () => {
    expect(isPrivateIp('fd00::1')).toBe(true);
  });

  it('should detect IPv4-mapped IPv6 as private', () => {
    expect(isPrivateIp('::ffff:10.0.0.1')).toBe(true);
    expect(isPrivateIp('::ffff:192.168.1.1')).toBe(true);
  });
});

describe('isPrivateOrigin', () => {
  it('should detect private origin URLs', () => {
    expect(isPrivateOrigin('http://10.0.0.1:3141')).toBe(true);
    expect(isPrivateOrigin('http://192.168.1.1:3141')).toBe(true);
    // localhost is handled by hostname check in isPrivateOrigin, not isPrivateIp
    expect(isPrivateOrigin('http://127.0.0.1:3141')).toBe(true);
  });

  it('should reject public origin URLs', () => {
    expect(isPrivateOrigin('https://example.com')).toBe(false);
    expect(isPrivateOrigin('https://8.8.8.8')).toBe(false);
  });

  it('should handle malformed URLs', () => {
    expect(isPrivateOrigin('not-a-url')).toBe(false);
    expect(isPrivateOrigin('')).toBe(false);
  });
});
