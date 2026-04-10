/**
 * Provision API tests — provisioning start, cleanup, deploy history.
 * Tests route handlers registered in api/provision.ts.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { IncomingMessage, ServerResponse } from 'node:http';

// ── Capture route handlers ────────────────────────────────
const registeredRoutes = new Map<string, (req: IncomingMessage, res: ServerResponse) => Promise<void>>();

vi.mock('../router.js', () => ({
  addRoute: (method: string, path: string, handler: (req: IncomingMessage, res: ServerResponse) => Promise<void>) => {
    registeredRoutes.set(`${method} ${path}`, handler);
  },
}));

vi.mock('../api/credentials.js', () => ({
  getSessionPassword: vi.fn(),
}));

vi.mock('../lib/vault.js', () => ({
  vaultGet: vi.fn(),
  vaultKeys: vi.fn(() => []),
}));

vi.mock('../lib/body-parser.js', () => ({
  parseJsonBody: vi.fn(),
}));

vi.mock('node:fs/promises', () => ({
  realpath: vi.fn((p: string) => Promise.resolve(p)),
}));

vi.mock('../lib/provisioners/types.js', () => ({}));

vi.mock('../lib/provisioner-registry.js', () => ({
  provisioners: {
    vps: {
      validate: vi.fn(() => []),
      provision: vi.fn(() => ({ success: true, resources: [], outputs: {} })),
      cleanup: vi.fn(),
    },
  },
  provisionKeys: { vps: ['aws-access-key-id', 'aws-secret-access-key', 'aws-region'] },
  GITHUB_LINKED_TARGETS: ['vercel', 'cloudflare', 'railway'],
  GITHUB_OPTIONAL_TARGETS: ['vps', 'static'],
}));

vi.mock('../lib/provision-manifest.js', () => ({
  createManifest: vi.fn(),
  updateManifestStatus: vi.fn(),
  readManifest: vi.fn(),
  deleteManifest: vi.fn(),
  listIncompleteRuns: vi.fn(() => []),
  manifestToCreatedResources: vi.fn(() => []),
}));

vi.mock('../lib/dns/cloudflare-dns.js', () => ({
  provisionDns: vi.fn(() => ({ records: [], zoneId: '' })),
  cleanupDnsRecords: vi.fn(),
}));

vi.mock('../lib/dns/cloudflare-registrar.js', () => ({
  registerDomain: vi.fn(() => ({ success: false })),
}));

vi.mock('../lib/github.js', () => ({
  prepareGithub: vi.fn(() => ({ success: false })),
}));

vi.mock('../lib/ssh-deploy.js', () => ({
  sshDeploy: vi.fn(() => ({})),
}));

vi.mock('../lib/s3-deploy.js', () => ({
  s3Deploy: vi.fn(() => ({})),
}));

vi.mock('../lib/build-step.js', () => ({
  runBuildStep: vi.fn(() => ({ success: true })),
  getBuildOutputDir: vi.fn(() => 'dist'),
}));

vi.mock('../lib/env-validator.js', () => ({
  generateEnvValidator: vi.fn(() => ({ file: null })),
}));

vi.mock('../lib/cost-estimator.js', () => ({
  emitCostEstimate: vi.fn(),
}));

vi.mock('../lib/deploy-log.js', () => ({
  logDeploy: vi.fn(() => '/tmp/deploy.log'),
  listDeploys: vi.fn(() => []),
}));

vi.mock('../lib/health-monitor.js', () => ({
  setupHealthMonitoring: vi.fn(),
}));

vi.mock('../lib/sentry-generator.js', () => ({
  generateSentryInit: vi.fn(),
}));

vi.mock('../lib/http-helpers.js', () => ({
  sendJson: vi.fn(),
}));

const { getSessionPassword } = await import('../api/credentials.js');
const { parseJsonBody } = await import('../lib/body-parser.js');
const { sendJson } = await import('../lib/http-helpers.js');
const { listDeploys } = await import('../lib/deploy-log.js');
const { listIncompleteRuns } = await import('../lib/provision-manifest.js');

await import('../api/provision.js');

function mockReq(): IncomingMessage {
  const req = {
    headers: {},
    url: '/',
    on: vi.fn(),
    socket: {},
  } as unknown as IncomingMessage;
  return req;
}
function mockRes(): ServerResponse {
  return {
    writeHead: vi.fn(),
    end: vi.fn(),
    setHeader: vi.fn(),
    write: vi.fn(),
    writableEnded: false,
  } as unknown as ServerResponse;
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ── POST /api/provision/start ──────────────────────────────

describe('POST /api/provision/start', () => {
  const handler = () => registeredRoutes.get('POST /api/provision/start')!;

  it('should reject when vault is locked', async () => {
    vi.mocked(getSessionPassword).mockReturnValue(null);
    const req = mockReq();
    const res = mockRes();
    await handler()(req, res);
    expect(sendJson).toHaveBeenCalledWith(res, 401, { error: 'Vault is locked.' });
  });

  it('should reject missing required fields', async () => {
    vi.mocked(getSessionPassword).mockReturnValue('password');
    vi.mocked(parseJsonBody).mockResolvedValue({});
    const req = mockReq();
    const res = mockRes();
    await handler()(req, res);
    expect(sendJson).toHaveBeenCalledWith(res, 400, expect.objectContaining({
      error: expect.stringContaining('required'),
    }));
  });

  it('should reject path traversal in projectDir', async () => {
    vi.mocked(getSessionPassword).mockReturnValue('password');
    vi.mocked(parseJsonBody).mockResolvedValue({
      projectDir: '/tmp/../etc/passwd',
      projectName: 'Test',
      deployTarget: 'vps',
    });
    const req = mockReq();
    const res = mockRes();
    await handler()(req, res);
    expect(sendJson).toHaveBeenCalledWith(res, 400, expect.objectContaining({
      error: expect.stringContaining('no ".."'),
    }));
  });

  it('should reject invalid hostname format', async () => {
    vi.mocked(getSessionPassword).mockReturnValue('password');
    vi.mocked(parseJsonBody).mockResolvedValue({
      projectDir: '/tmp/project',
      projectName: 'Test',
      deployTarget: 'vps',
      hostname: 'not a valid hostname!',
    });
    const req = mockReq();
    const res = mockRes();
    await handler()(req, res);
    expect(sendJson).toHaveBeenCalledWith(res, 400, expect.objectContaining({
      error: expect.stringContaining('Invalid hostname'),
    }));
  });

  it('should reject unknown deploy target', async () => {
    vi.mocked(getSessionPassword).mockReturnValue('password');
    vi.mocked(parseJsonBody).mockResolvedValue({
      projectDir: '/tmp/project',
      projectName: 'Test',
      deployTarget: 'unknown-target',
    });
    const req = mockReq();
    const res = mockRes();
    await handler()(req, res);
    expect(sendJson).toHaveBeenCalledWith(res, 400, expect.objectContaining({
      error: expect.stringContaining('Unknown deploy target'),
    }));
  });
});

// ── POST /api/provision/cleanup ────────────────────────────

describe('POST /api/provision/cleanup', () => {
  const handler = () => registeredRoutes.get('POST /api/provision/cleanup')!;

  it('should reject when vault is locked', async () => {
    vi.mocked(getSessionPassword).mockReturnValue(null);
    const req = mockReq();
    const res = mockRes();
    await handler()(req, res);
    expect(sendJson).toHaveBeenCalledWith(res, 401, { error: 'Vault is locked.' });
  });

  it('should return success when no resources to clean', async () => {
    vi.mocked(getSessionPassword).mockReturnValue('password');
    vi.mocked(parseJsonBody).mockResolvedValue({});
    const req = mockReq();
    const res = mockRes();
    await handler()(req, res);
    expect(sendJson).toHaveBeenCalledWith(res, 200, expect.objectContaining({
      cleaned: true,
    }));
  });
});

// ── GET /api/deploys ───────────────────────────────────────

describe('GET /api/deploys', () => {
  const handler = () => registeredRoutes.get('GET /api/deploys')!;

  it('should reject when vault is locked', async () => {
    vi.mocked(getSessionPassword).mockReturnValue(null);
    const req = mockReq();
    const res = mockRes();
    await handler()(req, res);
    expect(sendJson).toHaveBeenCalledWith(res, 401, { error: 'Vault is locked.' });
  });

  it('should return deploy history', async () => {
    vi.mocked(getSessionPassword).mockReturnValue('password');
    vi.mocked(listDeploys).mockResolvedValue([]);
    const req = mockReq();
    const res = mockRes();
    await handler()(req, res);
    expect(sendJson).toHaveBeenCalledWith(res, 200, { deploys: [] });
  });
});

// ── GET /api/provision/incomplete ──────────────────────────

describe('GET /api/provision/incomplete', () => {
  const handler = () => registeredRoutes.get('GET /api/provision/incomplete')!;

  it('should reject when vault is locked', async () => {
    vi.mocked(getSessionPassword).mockReturnValue(null);
    const req = mockReq();
    const res = mockRes();
    await handler()(req, res);
    expect(sendJson).toHaveBeenCalledWith(res, 401, { error: 'Vault is locked.' });
  });

  it('should return empty incomplete runs', async () => {
    vi.mocked(getSessionPassword).mockReturnValue('password');
    vi.mocked(listIncompleteRuns).mockResolvedValue([]);
    const req = mockReq();
    const res = mockRes();
    await handler()(req, res);
    expect(sendJson).toHaveBeenCalledWith(res, 200, { runs: [] });
  });
});
