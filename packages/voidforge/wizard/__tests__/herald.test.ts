/**
 * Herald tests — Haiku pre-scan dispatch engine.
 * Mocks node:https for API calls, exec for shell commands, fs for PRD reads.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'node:events';

// ── Mocks ──────────────────────────────────────────────

const mockRequest = vi.fn();

vi.mock('node:https', () => ({
  request: mockRequest,
}));

const mockExecCommand = vi.fn();
vi.mock('../lib/exec.js', () => ({
  execCommand: mockExecCommand,
}));

const mockReadFile = vi.fn();
vi.mock('node:fs/promises', () => ({
  readFile: mockReadFile,
}));

const { runHerald, gatherHeraldContext } = await import('../lib/herald.js');

import type { HeraldInput, AgentEntry } from '../lib/herald.js';

// ── Helpers ────────────────────────────────────────────

function createMockResponse(statusCode: number, body: string): EventEmitter & { statusCode: number } {
  const res = new EventEmitter() as EventEmitter & { statusCode: number };
  res.statusCode = statusCode;
  setTimeout(() => {
    res.emit('data', Buffer.from(body));
    res.emit('end');
  }, 0);
  return res;
}

function createMockReq(): EventEmitter & { write: ReturnType<typeof vi.fn>; end: ReturnType<typeof vi.fn>; destroy: ReturnType<typeof vi.fn> } {
  const req = new EventEmitter() as EventEmitter & { write: ReturnType<typeof vi.fn>; end: ReturnType<typeof vi.fn>; destroy: ReturnType<typeof vi.fn> };
  req.write = vi.fn();
  req.end = vi.fn();
  req.destroy = vi.fn();
  return req;
}

const sampleAgents: AgentEntry[] = [
  { id: 'galadriel', name: 'Galadriel', description: 'Frontend & UX', model: 'sonnet', tags: ['frontend', 'ux'] },
  { id: 'stark', name: 'Stark', description: 'Backend engineer', model: 'sonnet', tags: ['backend'] },
  { id: 'batman', name: 'Batman', description: 'QA investigator', model: 'sonnet' },
];

function mockHaikuSuccess(responseJson: Record<string, unknown>): void {
  mockRequest.mockImplementation((_opts: unknown, cb: (res: unknown) => void) => {
    const apiResponse = JSON.stringify({
      content: [{ text: JSON.stringify(responseJson) }],
    });
    const res = createMockResponse(200, apiResponse);
    cb(res);
    return createMockReq();
  });
}

const originalEnv = { ...process.env };

beforeEach(() => {
  vi.clearAllMocks();
  process.env['ANTHROPIC_API_KEY'] = 'test-key-123';
});

afterEach(() => {
  process.env = { ...originalEnv };
});

// ── runHerald ──────────────────────────────────────────

describe('runHerald', () => {
  const sampleInput: HeraldInput = {
    command: '/build',
    userArgs: '--fast',
    fileTree: ['src/index.ts', 'src/app.tsx'],
  };

  it('returns roster array from Haiku response', async () => {
    mockHaikuSuccess({
      roster: ['galadriel', 'stark', 'batman'],
      reasoning: 'Full stack project needs all three',
      estimatedAgents: 3,
    });

    const result = await runHerald(sampleInput, sampleAgents);
    expect(result.roster).toEqual(['galadriel', 'stark', 'batman']);
  });

  it('returns reasoning from Haiku response', async () => {
    mockHaikuSuccess({
      roster: ['galadriel'],
      reasoning: 'Frontend only project',
      estimatedAgents: 1,
    });

    const result = await runHerald(sampleInput, sampleAgents);
    expect(result.reasoning).toBe('Frontend only project');
  });

  it('returns estimatedAgents from Haiku response', async () => {
    mockHaikuSuccess({
      roster: ['galadriel', 'stark'],
      reasoning: 'Two agents needed',
      estimatedAgents: 2,
    });

    const result = await runHerald(sampleInput, sampleAgents);
    expect(result.estimatedAgents).toBe(2);
  });

  it('returns empty roster when API key is missing', async () => {
    delete process.env['ANTHROPIC_API_KEY'];

    const result = await runHerald(sampleInput, sampleAgents);
    expect(result.roster).toEqual([]);
    expect(result.reasoning).toBe('No API key available');
    expect(result.estimatedAgents).toBe(0);
  });

  it('returns empty roster when Haiku times out', async () => {
    mockRequest.mockImplementation((_opts: unknown, _cb: unknown) => {
      const req = createMockReq();
      setTimeout(() => req.emit('timeout'), 0);
      return req;
    });

    const result = await runHerald(sampleInput, sampleAgents);
    expect(result.roster).toEqual([]);
    expect(result.reasoning).toBe('Herald unavailable');
  });

  it('returns empty roster when Haiku returns invalid JSON', async () => {
    mockRequest.mockImplementation((_opts: unknown, cb: (res: unknown) => void) => {
      const res = createMockResponse(200, JSON.stringify({
        content: [{ text: 'this is not json at all' }],
      }));
      cb(res);
      return createMockReq();
    });

    const result = await runHerald(sampleInput, sampleAgents);
    expect(result.roster).toEqual([]);
    expect(result.reasoning).toBe('Herald unavailable');
  });

  it('handles markdown code fences in Haiku response', async () => {
    const fencedJson = '```json\n{"roster": ["galadriel"], "reasoning": "fenced", "estimatedAgents": 1}\n```';
    mockRequest.mockImplementation((_opts: unknown, cb: (res: unknown) => void) => {
      const res = createMockResponse(200, JSON.stringify({
        content: [{ text: fencedJson }],
      }));
      cb(res);
      return createMockReq();
    });

    const result = await runHerald(sampleInput, sampleAgents);
    expect(result.roster).toEqual(['galadriel']);
    expect(result.reasoning).toBe('fenced');
  });

  it('returns empty roster on API error status', async () => {
    mockRequest.mockImplementation((_opts: unknown, cb: (res: unknown) => void) => {
      const res = createMockResponse(500, 'Internal Server Error');
      cb(res);
      return createMockReq();
    });

    const result = await runHerald(sampleInput, sampleAgents);
    expect(result.roster).toEqual([]);
    expect(result.reasoning).toBe('Herald unavailable');
  });

  it('returns empty roster on network error', async () => {
    mockRequest.mockImplementation((_opts: unknown, _cb: unknown) => {
      const req = createMockReq();
      setTimeout(() => req.emit('error', new Error('ECONNREFUSED')), 0);
      return req;
    });

    const result = await runHerald(sampleInput, sampleAgents);
    expect(result.roster).toEqual([]);
    expect(result.reasoning).toBe('Herald unavailable');
  });

  it('filters non-string entries from roster', async () => {
    mockHaikuSuccess({
      roster: ['galadriel', 42, null, 'batman'],
      reasoning: 'Mixed types',
      estimatedAgents: 2,
    });

    const result = await runHerald(sampleInput, sampleAgents);
    expect(result.roster).toEqual(['galadriel', 'batman']);
  });

  it('handles estimated_agents snake_case fallback', async () => {
    mockHaikuSuccess({
      roster: ['galadriel'],
      reasoning: 'snake case test',
      estimated_agents: 5,
    });

    const result = await runHerald(sampleInput, sampleAgents);
    expect(result.estimatedAgents).toBe(5);
  });

  it('defaults estimatedAgents to roster length when missing', async () => {
    mockHaikuSuccess({
      roster: ['galadriel', 'stark', 'batman'],
      reasoning: 'no count provided',
    });

    const result = await runHerald(sampleInput, sampleAgents);
    expect(result.estimatedAgents).toBe(3);
  });

  it('passes command name to Haiku prompt', async () => {
    let capturedBody = '';
    mockRequest.mockImplementation((opts: unknown, cb: (res: unknown) => void) => {
      const req = createMockReq();
      req.write = vi.fn((data: string) => { capturedBody = data; });
      const apiResponse = JSON.stringify({
        content: [{ text: JSON.stringify({ roster: [], reasoning: '', estimatedAgents: 0 }) }],
      });
      const res = createMockResponse(200, apiResponse);
      cb(res);
      return req;
    });

    const input: HeraldInput = { command: '/security', userArgs: '', fileTree: [] };
    await runHerald(input, sampleAgents);

    const parsed = JSON.parse(capturedBody) as { messages: Array<{ content: string }> };
    expect(parsed.messages[0].content).toContain('Command: /security');
  });

  it('passes --focus to Haiku prompt when provided', async () => {
    let capturedBody = '';
    mockRequest.mockImplementation((_opts: unknown, cb: (res: unknown) => void) => {
      const req = createMockReq();
      req.write = vi.fn((data: string) => { capturedBody = data; });
      const apiResponse = JSON.stringify({
        content: [{ text: JSON.stringify({ roster: [], reasoning: '', estimatedAgents: 0 }) }],
      });
      const res = createMockResponse(200, apiResponse);
      cb(res);
      return req;
    });

    const input: HeraldInput = { command: '/build', userArgs: '', focus: 'authentication', fileTree: [] };
    await runHerald(input, sampleAgents);

    const parsed = JSON.parse(capturedBody) as { messages: Array<{ content: string }> };
    expect(parsed.messages[0].content).toContain('Focus bias: authentication');
  });

  it('includes agent tags in prompt', async () => {
    let capturedBody = '';
    mockRequest.mockImplementation((_opts: unknown, cb: (res: unknown) => void) => {
      const req = createMockReq();
      req.write = vi.fn((data: string) => { capturedBody = data; });
      const apiResponse = JSON.stringify({
        content: [{ text: JSON.stringify({ roster: [], reasoning: '', estimatedAgents: 0 }) }],
      });
      const res = createMockResponse(200, apiResponse);
      cb(res);
      return req;
    });

    await runHerald({ command: '/qa', userArgs: '', fileTree: [] }, sampleAgents);

    const parsed = JSON.parse(capturedBody) as { messages: Array<{ content: string }> };
    expect(parsed.messages[0].content).toContain('[frontend, ux]');
    expect(parsed.messages[0].content).toContain('[backend]');
  });
});

// ── gatherHeraldContext ────────────────────────────────

describe('gatherHeraldContext', () => {
  it('returns command name and user args', async () => {
    mockExecCommand.mockRejectedValue(new Error('no exec'));
    mockReadFile.mockRejectedValue(new Error('ENOENT'));

    const ctx = await gatherHeraldContext('/build', '--fast');
    expect(ctx.command).toBe('/build');
    expect(ctx.userArgs).toBe('--fast');
  });

  it('returns focus when provided', async () => {
    mockExecCommand.mockRejectedValue(new Error('no exec'));
    mockReadFile.mockRejectedValue(new Error('ENOENT'));

    const ctx = await gatherHeraldContext('/security', '', 'auth');
    expect(ctx.focus).toBe('auth');
  });

  it('returns undefined focus when not provided', async () => {
    mockExecCommand.mockRejectedValue(new Error('no exec'));
    mockReadFile.mockRejectedValue(new Error('ENOENT'));

    const ctx = await gatherHeraldContext('/build', '');
    expect(ctx.focus).toBeUndefined();
  });

  it('returns file tree array from exec call', async () => {
    mockExecCommand.mockImplementation((cmd: string) => {
      if (cmd === 'find') {
        return Promise.resolve({ stdout: 'src/index.ts\nsrc/app.tsx\nlib/utils.ts\n', stderr: '' });
      }
      return Promise.reject(new Error('not git'));
    });
    mockReadFile.mockRejectedValue(new Error('ENOENT'));

    const ctx = await gatherHeraldContext('/build', '');
    expect(ctx.fileTree).toEqual(['src/index.ts', 'src/app.tsx', 'lib/utils.ts']);
  });

  it('returns PRD frontmatter when docs/PRD.md exists', async () => {
    const prdContent = '---\nname: Test App\ntype: full-stack\n---\n\n## Overview\nThis is the app.';
    mockExecCommand.mockRejectedValue(new Error('no exec'));
    mockReadFile.mockImplementation((path: string) => {
      if (path === 'docs/PRD.md') return Promise.resolve(prdContent);
      return Promise.reject(new Error('ENOENT'));
    });

    const ctx = await gatherHeraldContext('/build', '');
    expect(ctx.prdFrontmatter).toContain('name: Test App');
  });

  it('returns git diff summary when uncommitted changes exist', async () => {
    mockExecCommand.mockImplementation((cmd: string, args: string[]) => {
      if (cmd === 'git' && args[0] === 'diff') {
        return Promise.resolve({ stdout: ' src/index.ts | 5 +++--\n 1 file changed\n', stderr: '' });
      }
      if (cmd === 'find') {
        return Promise.resolve({ stdout: '', stderr: '' });
      }
      return Promise.reject(new Error('unknown'));
    });
    mockReadFile.mockRejectedValue(new Error('ENOENT'));

    const ctx = await gatherHeraldContext('/build', '');
    expect(ctx.gitDiffSummary).toContain('src/index.ts');
  });

  it('returns undefined prdFrontmatter when PRD does not exist', async () => {
    mockExecCommand.mockRejectedValue(new Error('no exec'));
    mockReadFile.mockRejectedValue(new Error('ENOENT'));

    const ctx = await gatherHeraldContext('/build', '');
    expect(ctx.prdFrontmatter).toBeUndefined();
  });

  it('returns undefined gitDiffSummary when git not available', async () => {
    mockExecCommand.mockRejectedValue(new Error('not a git repo'));
    mockReadFile.mockRejectedValue(new Error('ENOENT'));

    const ctx = await gatherHeraldContext('/build', '');
    expect(ctx.gitDiffSummary).toBeUndefined();
  });

  it('returns empty file tree when find command fails', async () => {
    mockExecCommand.mockRejectedValue(new Error('command not found'));
    mockReadFile.mockRejectedValue(new Error('ENOENT'));

    const ctx = await gatherHeraldContext('/build', '');
    expect(ctx.fileTree).toEqual([]);
  });

  it('limits file tree to 80 entries', async () => {
    const bigList = Array.from({ length: 150 }, (_, i) => `src/file-${i}.ts`).join('\n');
    mockExecCommand.mockImplementation((cmd: string) => {
      if (cmd === 'find') return Promise.resolve({ stdout: bigList, stderr: '' });
      return Promise.reject(new Error('no'));
    });
    mockReadFile.mockRejectedValue(new Error('ENOENT'));

    const ctx = await gatherHeraldContext('/build', '');
    expect(ctx.fileTree.length).toBe(80);
  });

  it('returns empty gitDiffSummary when diff is empty string', async () => {
    mockExecCommand.mockImplementation((cmd: string, args: string[]) => {
      if (cmd === 'git' && args[0] === 'diff') {
        return Promise.resolve({ stdout: '', stderr: '' });
      }
      if (cmd === 'find') return Promise.resolve({ stdout: '', stderr: '' });
      return Promise.reject(new Error('unknown'));
    });
    mockReadFile.mockRejectedValue(new Error('ENOENT'));

    const ctx = await gatherHeraldContext('/build', '');
    expect(ctx.gitDiffSummary).toBeUndefined();
  });
});
