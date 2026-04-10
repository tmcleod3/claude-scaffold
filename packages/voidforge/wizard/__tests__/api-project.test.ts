/**
 * Project API tests — validate, create, defaults.
 * Tests route handlers registered in api/project.ts.
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

vi.mock('node:fs/promises', () => ({
  mkdir: vi.fn(),
  readFile: vi.fn(),
  writeFile: vi.fn(),
  copyFile: vi.fn(),
  readdir: vi.fn(() => []),
  stat: vi.fn(),
}));

vi.mock('node:child_process', () => ({
  execFile: vi.fn((_cmd: string, _args: string[], _opts: unknown, cb: (err: unknown) => void) => {
    if (cb) cb(null);
  }),
}));

vi.mock('node:util', () => ({
  promisify: (fn: unknown) => fn,
}));

vi.mock('../lib/body-parser.js', () => ({
  parseJsonBody: vi.fn(),
}));

vi.mock('../lib/project-registry.js', () => ({
  addProject: vi.fn(),
}));

vi.mock('../lib/tower-auth.js', () => ({
  validateSession: vi.fn(),
  parseSessionCookie: vi.fn(),
  getClientIp: vi.fn(() => '127.0.0.1'),
  isRemoteMode: vi.fn(() => false),
}));

vi.mock('../lib/http-helpers.js', () => ({
  sendJson: vi.fn(),
}));

vi.mock('../lib/marker.js', () => ({
  createMarker: vi.fn(() => ({})),
  writeMarker: vi.fn(),
}));

const { parseJsonBody } = await import('../lib/body-parser.js');
const { stat, readdir } = await import('node:fs/promises');
const { sendJson } = await import('../lib/http-helpers.js');

await import('../api/project.js');

function mockReq(): IncomingMessage {
  return { headers: {}, url: '/' } as unknown as IncomingMessage;
}
function mockRes(): ServerResponse {
  return { writeHead: vi.fn(), end: vi.fn(), setHeader: vi.fn() } as unknown as ServerResponse;
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ── POST /api/project/validate ─────────────────────────────

describe('POST /api/project/validate', () => {
  const handler = () => registeredRoutes.get('POST /api/project/validate')!;

  it('should reject missing project name', async () => {
    vi.mocked(parseJsonBody).mockResolvedValue({ directory: '/tmp/test' });
    const req = mockReq();
    const res = mockRes();
    await handler()(req, res);
    expect(sendJson).toHaveBeenCalledWith(res, 200, expect.objectContaining({
      valid: false,
      errors: expect.arrayContaining(['Project name is required']),
    }));
  });

  it('should reject missing directory', async () => {
    vi.mocked(parseJsonBody).mockResolvedValue({ name: 'MyProject' });
    const req = mockReq();
    const res = mockRes();
    await handler()(req, res);
    expect(sendJson).toHaveBeenCalledWith(res, 200, expect.objectContaining({
      valid: false,
      errors: expect.arrayContaining(['Project directory is required']),
    }));
  });

  it('should reject non-empty existing directory', async () => {
    vi.mocked(parseJsonBody).mockResolvedValue({ name: 'Test', directory: '/tmp/existing' });
    vi.mocked(stat).mockResolvedValue({ isDirectory: () => true } as never);
    vi.mocked(readdir).mockResolvedValue(['file.txt'] as never);
    const req = mockReq();
    const res = mockRes();
    await handler()(req, res);
    expect(sendJson).toHaveBeenCalledWith(res, 200, expect.objectContaining({
      valid: false,
      errors: expect.arrayContaining([expect.stringContaining('not empty')]),
    }));
  });

  it('should accept valid config with non-existent directory', async () => {
    vi.mocked(parseJsonBody).mockResolvedValue({ name: 'MyProject', directory: '/tmp/new-project' });
    vi.mocked(stat).mockRejectedValue(new Error('ENOENT'));
    const req = mockReq();
    const res = mockRes();
    await handler()(req, res);
    expect(sendJson).toHaveBeenCalledWith(res, 200, expect.objectContaining({
      valid: true,
      errors: [],
    }));
  });

  it('should suggest directory from project name', async () => {
    vi.mocked(parseJsonBody).mockResolvedValue({ name: 'My Cool App', directory: '/tmp/new' });
    vi.mocked(stat).mockRejectedValue(new Error('ENOENT'));
    const req = mockReq();
    const res = mockRes();
    await handler()(req, res);
    expect(sendJson).toHaveBeenCalledWith(res, 200, expect.objectContaining({
      suggestedDir: expect.stringContaining('my-cool-app'),
    }));
  });
});

// ── POST /api/project/create ───────────────────────────────

describe('POST /api/project/create', () => {
  const handler = () => registeredRoutes.get('POST /api/project/create')!;

  it('should reject missing name', async () => {
    vi.mocked(parseJsonBody).mockResolvedValue({ directory: '/tmp/proj' });
    const req = mockReq();
    const res = mockRes();
    await handler()(req, res);
    expect(sendJson).toHaveBeenCalledWith(res, 400, { error: 'name and directory are required strings' });
  });

  it('should reject non-object body', async () => {
    vi.mocked(parseJsonBody).mockResolvedValue(null);
    const req = mockReq();
    const res = mockRes();
    await handler()(req, res);
    expect(sendJson).toHaveBeenCalledWith(res, 400, { error: 'Request body must be a JSON object' });
  });

  it('should reject empty name', async () => {
    vi.mocked(parseJsonBody).mockResolvedValue({ name: '', directory: '/tmp/proj' });
    const req = mockReq();
    const res = mockRes();
    await handler()(req, res);
    expect(sendJson).toHaveBeenCalledWith(res, 400, { error: 'name and directory are required strings' });
  });
});

// ── GET /api/project/defaults ──────────────────────────────

describe('GET /api/project/defaults', () => {
  const handler = () => registeredRoutes.get('GET /api/project/defaults')!;

  it('should return default project paths', async () => {
    const req = mockReq();
    const res = mockRes();
    await handler()(req, res);
    expect(sendJson).toHaveBeenCalledWith(res, 200, expect.objectContaining({
      baseDir: expect.any(String),
      scaffoldDir: expect.any(String),
    }));
  });
});
