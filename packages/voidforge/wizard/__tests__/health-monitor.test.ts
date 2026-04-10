/**
 * Health monitor tests — VPS health check script generation and platform dashboard URLs.
 * Mocks filesystem to avoid writing real files.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('node:fs/promises', async (importOriginal) => {
  const original = await importOriginal<typeof import('node:fs/promises')>();
  return { ...original, writeFile: vi.fn(async () => {}), mkdir: vi.fn(async () => '') };
});

const { setupHealthMonitoring } = await import('../lib/health-monitor.js');

beforeEach(() => {
  vi.clearAllMocks();
});

describe('setupHealthMonitoring', () => {
  const emit = vi.fn();

  it('generates health check script for VPS with URL', async () => {
    const result = await setupHealthMonitoring('vps', '/tmp/project', 'my-app', 'https://my-app.com', {}, emit);
    expect(result.file).toBe('infra/healthcheck.sh');
    expect(emit).toHaveBeenCalledWith(expect.objectContaining({ step: 'health-monitor', status: 'done' }));
  });

  it('skips VPS without deploy URL', async () => {
    const result = await setupHealthMonitoring('vps', '/tmp/project', 'my-app', '', {}, emit);
    expect(result.file).toBeUndefined();
    expect(emit).toHaveBeenCalledWith(expect.objectContaining({ status: 'skipped' }));
  });

  it('returns Vercel dashboard URL', async () => {
    const result = await setupHealthMonitoring('vercel', '/tmp/project', 'my-app', 'https://my-app.vercel.app', { VERCEL_PROJECT_NAME: 'my-app' }, emit);
    expect(result.dashboardUrl).toContain('vercel.com');
  });

  it('returns Railway dashboard URL', async () => {
    const result = await setupHealthMonitoring('railway', '/tmp/project', 'my-app', 'https://my-app.up.railway.app', { RAILWAY_PROJECT_ID: 'proj-123' }, emit);
    expect(result.dashboardUrl).toContain('railway.app');
  });

  it('returns Cloudflare Pages dashboard URL', async () => {
    const result = await setupHealthMonitoring('cloudflare', '/tmp/project', 'my-app', 'https://my-app.pages.dev', { CF_PROJECT_NAME: 'my-app' }, emit);
    expect(result.dashboardUrl).toContain('dash.cloudflare.com');
  });

  it('skips Docker targets with advice', async () => {
    const result = await setupHealthMonitoring('docker', '/tmp/project', 'my-app', '', {}, emit);
    expect(result.file).toBeUndefined();
    expect(result.dashboardUrl).toBeUndefined();
    expect(emit).toHaveBeenCalledWith(expect.objectContaining({ status: 'skipped' }));
  });

  it('skips unknown deploy targets', async () => {
    const result = await setupHealthMonitoring('unknown', '/tmp/project', 'my-app', '', {}, emit);
    expect(result.file).toBeUndefined();
    expect(emit).toHaveBeenCalledWith(expect.objectContaining({ status: 'skipped' }));
  });
});
