/**
 * Network utilities — shared private IP detection for WebSocket origin validation.
 * Consolidates duplicate implementations from health-poller.ts and site-scanner.ts.
 *
 * Covers:
 * - RFC 1918: 10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16
 * - CGNAT/Tailscale: 100.64.0.0/10 (RFC 6598)
 * - Loopback: 127.0.0.0/8
 * - IPv6 ULA: fd00::/8 (ZeroTier, WireGuard)
 * - IPv6 loopback: ::1
 */

/**
 * Check if an IP address is in a private/internal range.
 * Uses numeric octet parsing — NEVER string prefix matching.
 * (SECURITY_AUDITOR.md: "ip.startsWith('172.2') matches public IPs like 172.200.x.x")
 */
export function isPrivateIp(ip: string): boolean {
  // IPv6 checks
  if (ip.includes(':')) {
    const normalized = ip.replace(/^\[/, '').replace(/\]$/, '');
    if (normalized === '::1') return true;
    // fd00::/8 — unique local addresses (ZeroTier, WireGuard)
    if (normalized.toLowerCase().startsWith('fd')) return true;
    // fe80::/10 — link-local
    if (normalized.toLowerCase().startsWith('fe80')) return true;
    return false;
  }

  // IPv4 checks — parse octets to integers
  const parts = ip.split('.');
  if (parts.length !== 4) return false;
  const octets = parts.map(Number);
  if (octets.some(n => isNaN(n) || n < 0 || n > 255)) return false;

  const [a, b] = octets;

  // 10.0.0.0/8
  if (a === 10) return true;
  // 172.16.0.0/12 (172.16.x.x through 172.31.x.x)
  if (a === 172 && b >= 16 && b <= 31) return true;
  // 192.168.0.0/16
  if (a === 192 && b === 168) return true;
  // 127.0.0.0/8 (loopback)
  if (a === 127) return true;
  // 100.64.0.0/10 (CGNAT — Tailscale uses this range)
  if (a === 100 && b >= 64 && b <= 127) return true;

  return false;
}

/**
 * Check if a WebSocket/HTTP origin is from a private network.
 * Extracts the hostname from the origin URL and checks if it's private.
 */
export function isPrivateOrigin(origin: string): boolean {
  try {
    const url = new URL(origin);
    return isPrivateIp(url.hostname);
  } catch {
    return false;
  }
}
