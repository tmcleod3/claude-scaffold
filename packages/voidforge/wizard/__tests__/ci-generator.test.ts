/**
 * CI generator tests — workflow generation for different frameworks and deploy targets.
 * Tier 2: Output validation (mocked filesystem).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('node:fs/promises', () => ({
  mkdir: vi.fn(() => Promise.resolve()),
  writeFile: vi.fn(() => Promise.resolve()),
}));

import { writeFile } from 'node:fs/promises';
import { generateCIWorkflows } from '../lib/ci-generator.js';

const mockWriteFile = vi.mocked(writeFile);

beforeEach(() => {
  vi.clearAllMocks();
});

describe('generateCIWorkflows', () => {
  it('generates ci.yml and deploy.yml', async () => {
    const result = await generateCIWorkflows('/test-project', 'express', 'vercel');
    expect(result.success).toBe(true);
    expect(result.files).toContain('.github/workflows/ci.yml');
    expect(result.files).toContain('.github/workflows/deploy.yml');
    expect(mockWriteFile).toHaveBeenCalledTimes(2);
  });

  it('generates Node setup for express', async () => {
    await generateCIWorkflows('/test-project', 'express', 'docker');
    const ciContent = mockWriteFile.mock.calls[0][1] as string;
    expect(ciContent).toContain('setup-node@v4');
    expect(ciContent).toContain('npm ci');
  });

  it('generates Python setup for django', async () => {
    await generateCIWorkflows('/test-project', 'django', 'vps');
    const ciContent = mockWriteFile.mock.calls[0][1] as string;
    expect(ciContent).toContain('setup-python@v5');
    expect(ciContent).toContain('pytest');
  });

  it('generates Ruby setup for rails', async () => {
    await generateCIWorkflows('/test-project', 'rails', 'vps');
    const ciContent = mockWriteFile.mock.calls[0][1] as string;
    expect(ciContent).toContain('setup-ruby@v1');
    expect(ciContent).toContain('rspec');
  });

  it('includes Vercel deploy step for vercel target', async () => {
    await generateCIWorkflows('/test-project', 'next.js', 'vercel');
    const deployContent = mockWriteFile.mock.calls[1][1] as string;
    expect(deployContent).toContain('vercel-action');
    expect(deployContent).toContain('VERCEL_TOKEN');
  });

  it('includes S3 sync for static deploy target', async () => {
    await generateCIWorkflows('/test-project', 'vite', 'static');
    const deployContent = mockWriteFile.mock.calls[1][1] as string;
    expect(deployContent).toContain('aws s3 sync');
    expect(deployContent).toContain('AWS_ACCESS_KEY_ID');
  });

  it('includes SSH commands for vps deploy target', async () => {
    await generateCIWorkflows('/test-project', 'express', 'vps');
    const deployContent = mockWriteFile.mock.calls[1][1] as string;
    expect(deployContent).toContain('SSH_PRIVATE_KEY');
    expect(deployContent).toContain('SSH_HOST');
  });

  it('includes Cloudflare Pages for cloudflare target', async () => {
    await generateCIWorkflows('/test-project', 'next.js', 'cloudflare');
    const deployContent = mockWriteFile.mock.calls[1][1] as string;
    expect(deployContent).toContain('wrangler-action');
    expect(deployContent).toContain('CLOUDFLARE_API_TOKEN');
  });

  it('uses defaults for unknown framework', async () => {
    await generateCIWorkflows('/test-project', 'unknown-framework', 'docker');
    const ciContent = mockWriteFile.mock.calls[0][1] as string;
    // Falls back to node
    expect(ciContent).toContain('setup-node@v4');
  });
});
