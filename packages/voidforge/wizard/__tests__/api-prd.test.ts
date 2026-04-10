/**
 * PRD API tests — validate, env-requirements, templates.
 * Tests route handlers registered in api/prd.ts.
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

vi.mock('node:https', () => ({
  request: vi.fn(),
}));

vi.mock('node:fs/promises', () => ({
  readFile: vi.fn(),
}));

vi.mock('../lib/vault.js', () => ({
  vaultGet: vi.fn(),
}));

vi.mock('../api/credentials.js', () => ({
  getSessionPassword: vi.fn(),
}));

vi.mock('../lib/anthropic.js', () => ({
  resolveModelWithLimits: vi.fn(() => ({ id: 'claude-sonnet-4-20250514', maxTokens: 8192 })),
}));

vi.mock('../lib/frontmatter.js', () => ({
  parseFrontmatter: vi.fn(() => ({ frontmatter: {} })),
  validateFrontmatter: vi.fn(() => []),
}));

vi.mock('../lib/body-parser.js', () => ({
  parseJsonBody: vi.fn(),
}));

vi.mock('../lib/templates.js', () => ({
  listTemplates: vi.fn(() => [
    { id: 'saas', name: 'SaaS App', description: 'Full-stack SaaS' },
    { id: 'api', name: 'API Service', description: 'REST API' },
  ]),
  getTemplate: vi.fn((id: string) => {
    if (id === 'saas') return {
      id: 'saas',
      name: 'SaaS App',
      description: 'Full-stack SaaS',
      frontmatter: { type: 'saas', framework: 'next.js' },
      prdSections: '# Requirements\n...',
    };
    return null;
  }),
}));

vi.mock('../lib/http-helpers.js', () => ({
  sendJson: vi.fn(),
}));

const { parseJsonBody } = await import('../lib/body-parser.js');
const { parseFrontmatter, validateFrontmatter } = await import('../lib/frontmatter.js');
const { readFile } = await import('node:fs/promises');
const { sendJson } = await import('../lib/http-helpers.js');

await import('../api/prd.js');

function mockReq(url = '/'): IncomingMessage {
  return { headers: { host: 'localhost' }, url } as unknown as IncomingMessage;
}
function mockRes(): ServerResponse {
  return { writeHead: vi.fn(), end: vi.fn(), setHeader: vi.fn() } as unknown as ServerResponse;
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ── POST /api/prd/validate ─────────────────────────────────

describe('POST /api/prd/validate', () => {
  const handler = () => registeredRoutes.get('POST /api/prd/validate')!;

  it('should reject missing content', async () => {
    vi.mocked(parseJsonBody).mockResolvedValue({});
    const req = mockReq();
    const res = mockRes();
    await handler()(req, res);
    expect(sendJson).toHaveBeenCalledWith(res, 400, { error: 'content is required' });
  });

  it('should return valid result for good PRD', async () => {
    vi.mocked(parseJsonBody).mockResolvedValue({ content: '---\nname: Test\n---\n# PRD' });
    vi.mocked(parseFrontmatter).mockReturnValue({ frontmatter: { name: 'Test' }, content: '' });
    vi.mocked(validateFrontmatter).mockReturnValue([]);
    const req = mockReq();
    const res = mockRes();
    await handler()(req, res);
    expect(sendJson).toHaveBeenCalledWith(res, 200, expect.objectContaining({
      valid: true,
      errors: [],
    }));
  });

  it('should return errors for invalid frontmatter', async () => {
    vi.mocked(parseJsonBody).mockResolvedValue({ content: '---\n---\n# PRD' });
    vi.mocked(parseFrontmatter).mockReturnValue({ frontmatter: {}, content: '' });
    vi.mocked(validateFrontmatter).mockReturnValue(['Missing name']);
    const req = mockReq();
    const res = mockRes();
    await handler()(req, res);
    expect(sendJson).toHaveBeenCalledWith(res, 200, expect.objectContaining({
      valid: false,
      errors: ['Missing name'],
    }));
  });
});

// ── POST /api/prd/env-requirements ─────────────────────────

describe('POST /api/prd/env-requirements', () => {
  const handler = () => registeredRoutes.get('POST /api/prd/env-requirements')!;

  it('should reject missing content', async () => {
    vi.mocked(parseJsonBody).mockResolvedValue({});
    const req = mockReq();
    const res = mockRes();
    await handler()(req, res);
    expect(sendJson).toHaveBeenCalledWith(res, 400, { error: 'content is required' });
  });

  it('should parse env requirements from PRD content', async () => {
    const prdContent = [
      '# ─── WhatsApp Business API ───────',
      'WHATSAPP_API_KEY="your-key-here"',
      'WHATSAPP_SECRET="your-secret"',
    ].join('\n');
    vi.mocked(parseJsonBody).mockResolvedValue({ content: prdContent });
    const req = mockReq();
    const res = mockRes();
    await handler()(req, res);
    expect(sendJson).toHaveBeenCalledWith(res, 200, expect.objectContaining({
      groups: expect.arrayContaining([
        expect.objectContaining({
          name: 'WhatsApp Business API',
          fields: expect.arrayContaining([
            expect.objectContaining({ key: 'WHATSAPP_API_KEY' }),
          ]),
        }),
      ]),
    }));
  });

  it('should skip infrastructure vars', async () => {
    const prdContent = [
      '# ─── App Config ───────',
      'NODE_ENV=production',
      'DATABASE_URL=postgres://...',
      'PORT=3000',
    ].join('\n');
    vi.mocked(parseJsonBody).mockResolvedValue({ content: prdContent });
    const req = mockReq();
    const res = mockRes();
    await handler()(req, res);
    expect(sendJson).toHaveBeenCalledWith(res, 200, { groups: [] });
  });
});

// ── GET /api/prd/template ──────────────────────────────────

describe('GET /api/prd/template', () => {
  const handler = () => registeredRoutes.get('GET /api/prd/template')!;

  it('should return PRD template content', async () => {
    vi.mocked(readFile).mockResolvedValue('# PRD Template\n---' as never);
    const req = mockReq();
    const res = mockRes();
    await handler()(req, res);
    expect(sendJson).toHaveBeenCalledWith(res, 200, { content: '# PRD Template\n---' });
  });

  it('should return 500 when template file not found', async () => {
    vi.mocked(readFile).mockRejectedValue(new Error('ENOENT'));
    const req = mockReq();
    const res = mockRes();
    await handler()(req, res);
    expect(sendJson).toHaveBeenCalledWith(res, 500, { error: 'Could not load PRD template' });
  });
});

// ── GET /api/prd/templates ─────────────────────────────────

describe('GET /api/prd/templates', () => {
  const handler = () => registeredRoutes.get('GET /api/prd/templates')!;

  it('should return list of templates', async () => {
    const req = mockReq();
    const res = mockRes();
    await handler()(req, res);
    expect(sendJson).toHaveBeenCalledWith(res, 200, {
      templates: expect.arrayContaining([
        expect.objectContaining({ id: 'saas' }),
      ]),
    });
  });
});

// ── GET /api/prd/templates/get ─────────────────────────────

describe('GET /api/prd/templates/get', () => {
  const handler = () => registeredRoutes.get('GET /api/prd/templates/get')!;

  it('should reject missing id parameter', async () => {
    const req = mockReq('/api/prd/templates/get');
    const res = mockRes();
    await handler()(req, res);
    expect(sendJson).toHaveBeenCalledWith(res, 400, { error: 'id query parameter is required' });
  });

  it('should return template by id', async () => {
    const req = mockReq('/api/prd/templates/get?id=saas');
    const res = mockRes();
    await handler()(req, res);
    expect(sendJson).toHaveBeenCalledWith(res, 200, expect.objectContaining({
      template: expect.objectContaining({ id: 'saas' }),
    }));
  });

  it('should return 404 for unknown template', async () => {
    const req = mockReq('/api/prd/templates/get?id=nonexistent');
    const res = mockRes();
    await handler()(req, res);
    expect(sendJson).toHaveBeenCalledWith(res, 404, expect.objectContaining({
      error: expect.stringContaining('not found'),
    }));
  });
});
