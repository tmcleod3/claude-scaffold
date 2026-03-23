/**
 * Health Poller — Background service that pings project health endpoints.
 * Runs every 5 minutes when the server is active.
 * Non-blocking: uses fetch with 5-second timeout per project.
 */

import { readRegistry, updateHealthStatus, type HealthStatus } from './project-registry.js';
import { isPrivateIp } from './network.js';

const POLL_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
const FETCH_TIMEOUT_MS = 5_000; // 5 seconds per project

let pollTimer: ReturnType<typeof setInterval> | null = null;
let initialTimer: ReturnType<typeof setTimeout> | null = null;

/** Validate health check URL — only allow http(s) to non-private hosts. */
function isValidHealthUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return false;

    // Block SSRF targets: metadata endpoints, localhost, private ranges
    const host = parsed.hostname.toLowerCase();

    // Localhost variants
    // Use shared private IP check (Gauntlet v13.1 consolidation)
    if (host === 'localhost' || isPrivateIp(host)) return false;
    if (host === '0.0.0.0' || host === '127.1') return false;

    // AWS/cloud metadata
    if (host === '169.254.169.254') return false;
    if (host.startsWith('fe80') || host.startsWith('fc00') || host.startsWith('fd')) return false;

    // Block bracket-wrapped IPv6
    if (host.startsWith('[')) return false;

    // Block numeric-only hostnames (decimal IP like 2130706433)
    if (/^\d+$/.test(host)) return false;

    // Block hex IPs (0x7f000001) and octal IPs (0177.0.0.1)
    if (/^0[x0-9]/.test(host)) return false;

    return true;
  } catch {
    return false;
  }
}

/** Check a single project's health endpoint. */
async function checkHealth(url: string): Promise<HealthStatus> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      method: 'GET',
      signal: controller.signal,
      redirect: 'manual', // Don't follow redirects — prevents redirect-based SSRF
      headers: { 'User-Agent': 'VoidForge-HealthPoller/1.0' },
    });

    if (response.status === 200) return 'healthy';
    return 'degraded';
  } catch {
    return 'down';
  } finally {
    clearTimeout(timeout);
  }
}

/** Poll all projects with health check URLs (parallel). */
async function pollAll(): Promise<void> {
  try {
    const projects = await readRegistry();
    const withUrls = projects.filter((p) => p.healthCheckUrl && isValidHealthUrl(p.healthCheckUrl));

    if (withUrls.length === 0) return;

    // Check all health endpoints in parallel (bounded by fetch timeout)
    const results = await Promise.allSettled(
      withUrls.map(async (project) => {
        const status = await checkHealth(project.healthCheckUrl);
        await updateHealthStatus(project.id, status);
      }),
    );

    // Log any individual failures (non-fatal)
    for (const result of results) {
      if (result.status === 'rejected') {
        console.error('Health check failed:', result.reason instanceof Error ? result.reason.message : 'Unknown');
      }
    }
  } catch (err) {
    // Registry read failures are non-fatal — log and continue
    console.error('Health poller error:', err instanceof Error ? err.message : 'Unknown error');
  }
}

/** Start the background health poller. Idempotent — calling twice is safe. */
export function startHealthPoller(): void {
  if (pollTimer) return; // Already running

  // Run first poll after a short delay (don't block server startup)
  initialTimer = setTimeout(() => {
    initialTimer = null;
    pollAll().catch(() => {});
  }, 10_000);
  initialTimer.unref();

  pollTimer = setInterval(() => {
    pollAll().catch(() => {});
  }, POLL_INTERVAL_MS);
  pollTimer.unref();
}

/** Stop the background health poller. */
export function stopHealthPoller(): void {
  if (initialTimer) {
    clearTimeout(initialTimer);
    initialTimer = null;
  }
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}
