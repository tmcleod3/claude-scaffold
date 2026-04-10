/**
 * Blueprint API tests — PRD validation and blueprint path.
 * Tests validateBlueprint and executeBlueprintMerge exported functions,
 * plus route handlers registered via addRoute.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Readable } from 'node:stream';
import type { IncomingMessage, ServerResponse } from 'node:http';

// ── Capture route handlers ────────────────────────────────
const registeredRoutes = new Map<string, (req: IncomingMessage, res: ServerResponse) => Promise<void>>();

vi.mock('../router.js', () => ({
  addRoute: (method: string, path: string, handler: (req: IncomingMessage, res: ServerResponse) => Promise<void>) => {
    registeredRoutes.set(`${method} ${path}`, handler);
  },
}));

vi.mock('node:fs', () => ({
  existsSync: vi.fn(),
}));

vi.mock('node:fs/promises', () => ({
  readFile: vi.fn(),
}));

vi.mock('../lib/frontmatter.js', () => ({
  parseFrontmatter: vi.fn(() => ({ frontmatter: {} })),
  validateFrontmatter: vi.fn(() => []),
}));

vi.mock('../lib/prd-validator.js', () => ({
  validatePrdStructure: vi.fn(() => ({ warnings: [] })),
  scanConflicts: vi.fn(() => []),
}));

vi.mock('../lib/document-discovery.js', () => ({
  discoverDocuments: vi.fn(() => ({ prd: null, projectDirectives: null, operations: null, adrs: [], references: [], total: 0 })),
  summarizeDiscovery: vi.fn(() => ''),
}));

vi.mock('../lib/claude-merge.js', () => ({
  mergeProjectDirectives: vi.fn(() => ({ merged: true, reason: 'Merged successfully' })),
  isAlreadyMerged: vi.fn(() => false),
}));

vi.mock('../lib/marker.js', () => ({
  findProjectRoot: vi.fn(() => '/tmp/test-project'),
}));

const { existsSync } = await import('node:fs');
const { readFile } = await import('node:fs/promises');
const { parseFrontmatter } = await import('../lib/frontmatter.js');
const { isAlreadyMerged } = await import('../lib/claude-merge.js');

const { validateBlueprint, executeBlueprintMerge } = await import('../api/blueprint.js');

beforeEach(() => {
  vi.clearAllMocks();
});

// ── validateBlueprint tests ────────────────────────────────

describe('validateBlueprint', () => {
  it('should return invalid when no PRD exists', async () => {
    vi.mocked(existsSync).mockReturnValue(false);
    const result = await validateBlueprint('/tmp/no-prd');
    expect(result.valid).toBe(false);
    expect(result.prdFound).toBe(false);
    expect(result.frontmatterErrors).toContain('No PRD found at docs/PRD.md');
  });

  it('should return valid when PRD exists with valid frontmatter', async () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFile).mockResolvedValue('---\nname: test\n---\n# PRD' as never);
    vi.mocked(parseFrontmatter).mockReturnValue({ frontmatter: { name: 'Test', framework: 'next.js', deploy: 'vercel' }, content: '' });

    const result = await validateBlueprint('/tmp/valid-project');
    expect(result.valid).toBe(true);
    expect(result.prdFound).toBe(true);
    expect(result.frontmatterErrors).toHaveLength(0);
  });

  it('should report frontmatter errors', async () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFile).mockResolvedValue('---\n---\n# PRD' as never);
    const { validateFrontmatter } = await import('../lib/frontmatter.js');
    vi.mocked(validateFrontmatter).mockReturnValue(['Missing required field: name']);

    const result = await validateBlueprint('/tmp/invalid-frontmatter');
    expect(result.valid).toBe(false);
    expect(result.frontmatterErrors).toContain('Missing required field: name');
  });

  it('should include document discovery counts in summary', async () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFile).mockResolvedValue('---\nname: test\n---\n' as never);
    vi.mocked(parseFrontmatter).mockReturnValue({ frontmatter: { name: 'Test' }, content: '' });
    const { discoverDocuments } = await import('../lib/document-discovery.js');
    vi.mocked(discoverDocuments).mockResolvedValue({ prd: 'docs/PRD.md', projectDirectives: null, operations: null, adrs: [], references: [], total: 5 });

    const result = await validateBlueprint('/tmp/docs-project');
    expect(result.summary).toContain('Documents: 5 found');
  });
});

// ── executeBlueprintMerge tests ────────────────────────────

describe('executeBlueprintMerge', () => {
  it('should return not merged when no directives path', async () => {
    const result = await executeBlueprintMerge('/tmp/project', null);
    expect(result.merged).toBe(false);
    expect(result.reason).toContain('No project directives');
  });

  it('should reject path traversal attacks', async () => {
    const result = await executeBlueprintMerge('/tmp/project', '../../../etc/passwd');
    expect(result.merged).toBe(false);
    expect(result.reason).toContain('Invalid directives path');
  });

  it('should reject absolute paths', async () => {
    const result = await executeBlueprintMerge('/tmp/project', '/etc/passwd');
    expect(result.merged).toBe(false);
    expect(result.reason).toContain('Invalid directives path');
  });

  it('should skip when already merged', async () => {
    vi.mocked(isAlreadyMerged).mockResolvedValue(true);
    const result = await executeBlueprintMerge('/tmp/project', 'directives.md');
    expect(result.merged).toBe(false);
    expect(result.reason).toContain('already merged');
  });
});

// ── Route handler tests ────────────────────────────────────

function mockReq(url: string): IncomingMessage {
  const stream = new Readable({ read() {} }) as unknown as IncomingMessage;
  stream.headers = { host: 'localhost:3000' };
  stream.url = url;
  return stream;
}

function mockRes(): ServerResponse & { _status: number; _body: string } {
  const state = { _status: 0, _body: '' };
  const res = {
    writeHead(status: number) { state._status = status; return res; },
    end(data?: string) { if (data) state._body = data; },
    get _status() { return state._status; },
    get _body() { return state._body; },
  };
  return res as unknown as ServerResponse & { _status: number; _body: string };
}

describe('GET /api/blueprint/detect', () => {
  const handler = () => registeredRoutes.get('GET /api/blueprint/detect')!;

  it('should detect PRD when it exists', async () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFile).mockResolvedValue('---\nname: MyApp\ntype: saas\n---' as never);
    vi.mocked(parseFrontmatter).mockReturnValue({ frontmatter: { name: 'MyApp', type: 'saas' }, content: '' });
    const res = mockRes();
    await handler()(mockReq('/api/blueprint/detect?dir=/tmp/proj'), res);
    const body = JSON.parse(res._body);
    expect(body.detected).toBe(true);
    expect(body.name).toBe('MyApp');
  });

  it('should return detected false when no PRD', async () => {
    vi.mocked(existsSync).mockReturnValue(false);
    const res = mockRes();
    await handler()(mockReq('/api/blueprint/detect?dir=/tmp/no-prd'), res);
    const body = JSON.parse(res._body);
    expect(body.detected).toBe(false);
  });
});
