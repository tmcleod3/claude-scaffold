/**
 * Deploy API tests — project scanning for deploy info.
 * Tests the POST /api/deploy/scan route handler.
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
  readFile: vi.fn(),
  access: vi.fn(),
  realpath: vi.fn((p: string) => Promise.resolve(p)),
}));

vi.mock('../lib/body-parser.js', () => ({
  parseJsonBody: vi.fn(),
}));

vi.mock('../lib/frontmatter.js', () => ({
  parseFrontmatter: vi.fn(() => ({ frontmatter: {} })),
}));

vi.mock('../lib/instance-sizing.js', () => ({
  recommendInstanceType: vi.fn(() => 't3.small'),
}));

vi.mock('../lib/http-helpers.js', () => ({
  sendJson: vi.fn(),
}));

const { parseJsonBody } = await import('../lib/body-parser.js');
const { access, readFile, realpath } = await import('node:fs/promises');
const { parseFrontmatter } = await import('../lib/frontmatter.js');
const { sendJson } = await import('../lib/http-helpers.js');

await import('../api/deploy.js');

function mockReq(): IncomingMessage {
  return { headers: {}, url: '/' } as unknown as IncomingMessage;
}
function mockRes(): ServerResponse {
  return { writeHead: vi.fn(), end: vi.fn(), setHeader: vi.fn() } as unknown as ServerResponse;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('POST /api/deploy/scan', () => {
  const handler = () => registeredRoutes.get('POST /api/deploy/scan')!;

  it('should reject missing directory', async () => {
    vi.mocked(parseJsonBody).mockResolvedValue({});
    const req = mockReq();
    const res = mockRes();
    await handler()(req, res);
    expect(sendJson).toHaveBeenCalledWith(res, 400, { error: 'directory is required' });
  });

  it('should reject relative path', async () => {
    vi.mocked(parseJsonBody).mockResolvedValue({ directory: 'relative/path' });
    const req = mockReq();
    const res = mockRes();
    await handler()(req, res);
    expect(sendJson).toHaveBeenCalledWith(res, 400, expect.objectContaining({
      error: expect.stringContaining('absolute path'),
    }));
  });

  it('should reject path traversal', async () => {
    vi.mocked(parseJsonBody).mockResolvedValue({ directory: '/tmp/../etc/passwd' });
    const req = mockReq();
    const res = mockRes();
    await handler()(req, res);
    expect(sendJson).toHaveBeenCalledWith(res, 400, expect.objectContaining({
      error: expect.stringContaining('no ".."'),
    }));
  });

  it('should reject non-existent directory', async () => {
    vi.mocked(parseJsonBody).mockResolvedValue({ directory: '/nonexistent/path' });
    vi.mocked(access).mockRejectedValue(new Error('ENOENT'));
    const req = mockReq();
    const res = mockRes();
    await handler()(req, res);
    expect(sendJson).toHaveBeenCalledWith(res, 400, expect.objectContaining({
      error: expect.stringContaining('not found'),
    }));
  });

  it('should reject non-VoidForge project (no CLAUDE.md)', async () => {
    vi.mocked(parseJsonBody).mockResolvedValue({ directory: '/tmp/some-project' });
    vi.mocked(access).mockImplementation(async (path) => {
      if (String(path).endsWith('CLAUDE.md')) throw new Error('ENOENT');
    });
    vi.mocked(realpath).mockResolvedValue('/tmp/some-project');
    const req = mockReq();
    const res = mockRes();
    await handler()(req, res);
    expect(sendJson).toHaveBeenCalledWith(res, 400, expect.objectContaining({
      error: expect.stringContaining('no CLAUDE.md found'),
    }));
  });

  it('should return scan results for valid project', async () => {
    vi.mocked(parseJsonBody).mockResolvedValue({ directory: '/tmp/my-project' });
    vi.mocked(access).mockResolvedValue(undefined);
    vi.mocked(realpath).mockResolvedValue('/tmp/my-project');
    vi.mocked(readFile).mockImplementation(async (path) => {
      const p = String(path);
      if (p.endsWith('CLAUDE.md')) return '**Name:** MyProject' as never;
      if (p.endsWith('.env')) return 'DEPLOY_TARGET=vps\n' as never;
      if (p.endsWith('PRD.md')) return '---\nframework: next.js\n---' as never;
      throw new Error('ENOENT');
    });
    vi.mocked(parseFrontmatter).mockReturnValue({ frontmatter: { framework: 'next.js', database: 'postgres', cache: 'redis' }, content: '' });

    const req = mockReq();
    const res = mockRes();
    await handler()(req, res);
    expect(sendJson).toHaveBeenCalledWith(res, 200, expect.objectContaining({
      valid: true,
      name: 'MyProject',
      deploy: 'vps',
      framework: 'next.js',
    }));
  });
});
