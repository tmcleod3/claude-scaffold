/**
 * Agent Registry tests — loading, parsing, caching, and summary formatting.
 * Mocks node:fs/promises to avoid reading real agent files.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mocks ──────────────────────────────────────────────

const mockReaddir = vi.fn();
const mockReadFile = vi.fn();

vi.mock('node:fs/promises', () => ({
  readdir: mockReaddir,
  readFile: mockReadFile,
}));

const { loadAgentRegistry, clearRegistryCache, getRegistrySummary } = await import('../lib/agent-registry.js');

import type { AgentEntry } from '../lib/agent-registry.js';

// ── Helpers ────────────────────────────────────────────

function agentMd(frontmatter: Record<string, string>): string {
  const lines = Object.entries(frontmatter).map(([k, v]) => `${k}: ${v}`);
  return `---\n${lines.join('\n')}\n---\n\nAgent body content here.`;
}

function agentMdMultiline(scalars: Record<string, string>, arrays: Record<string, string[]>): string {
  const scalarLines = Object.entries(scalars).map(([k, v]) => `${k}: ${v}`);
  const arrayLines = Object.entries(arrays).map(([k, vs]) => {
    return `${k}:\n${vs.map((v) => `  - ${v}`).join('\n')}`;
  });
  return `---\n${[...scalarLines, ...arrayLines].join('\n')}\n---\n\nBody.`;
}

// ── Setup ──────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  clearRegistryCache();
});

// ── loadAgentRegistry ──────────────────────────────────

describe('loadAgentRegistry', () => {
  it('reads all .md files from agents directory', async () => {
    mockReaddir.mockResolvedValue(['galadriel.md', 'stark.md']);
    mockReadFile.mockResolvedValue(agentMd({ name: 'Agent', description: 'Desc', model: 'sonnet' }));

    const registry = await loadAgentRegistry('/fake/agents');
    expect(mockReaddir).toHaveBeenCalledWith('/fake/agents');
    expect(registry).toHaveLength(2);
  });

  it('parses YAML frontmatter correctly (name, description, model)', async () => {
    mockReaddir.mockResolvedValue(['galadriel.md']);
    mockReadFile.mockResolvedValue(agentMd({
      name: 'Galadriel',
      description: 'Frontend & UX specialist',
      model: 'opus',
    }));

    const registry = await loadAgentRegistry('/fake/agents');
    expect(registry[0].name).toBe('Galadriel');
    expect(registry[0].description).toBe('Frontend & UX specialist');
    expect(registry[0].model).toBe('opus');
  });

  it('parses inline tags array from frontmatter', async () => {
    mockReaddir.mockResolvedValue(['galadriel.md']);
    mockReadFile.mockResolvedValue(
      '---\nname: Galadriel\ndescription: UX\nmodel: sonnet\ntags: [frontend, ux, a11y]\n---\n\nBody.',
    );

    const registry = await loadAgentRegistry('/fake/agents');
    expect(registry[0].tags).toEqual(['frontend', 'ux', 'a11y']);
  });

  it('parses multi-line tools array from frontmatter', async () => {
    mockReaddir.mockResolvedValue(['batman.md']);
    mockReadFile.mockResolvedValue(
      agentMdMultiline(
        { name: 'Batman', description: 'QA', model: 'sonnet' },
        { tools: ['Read', 'Bash', 'Grep'] },
      ),
    );

    const registry = await loadAgentRegistry('/fake/agents');
    expect(registry[0].tools).toEqual(['Read', 'Bash', 'Grep']);
  });

  it('returns sorted array by id (filename)', async () => {
    mockReaddir.mockResolvedValue(['stark.md', 'batman.md', 'galadriel.md']);
    mockReadFile.mockImplementation((_path: string) => {
      return Promise.resolve(agentMd({ name: 'Agent', description: 'Desc', model: 'sonnet' }));
    });

    const registry = await loadAgentRegistry('/fake/agents');
    const ids = registry.map((a) => a.id);
    expect(ids).toEqual(['batman', 'galadriel', 'stark']);
  });

  it('caches result on second call', async () => {
    mockReaddir.mockResolvedValue(['galadriel.md']);
    mockReadFile.mockResolvedValue(agentMd({ name: 'Galadriel', description: 'UX', model: 'sonnet' }));

    await loadAgentRegistry('/fake/agents');
    await loadAgentRegistry('/fake/agents');
    expect(mockReaddir).toHaveBeenCalledTimes(1);
    expect(mockReadFile).toHaveBeenCalledTimes(1);
  });

  it('handles missing agents directory gracefully', async () => {
    mockReaddir.mockRejectedValue(new Error('ENOENT: no such file or directory'));

    await expect(loadAgentRegistry('/nonexistent')).rejects.toThrow('ENOENT');
  });

  it('skips entries with malformed YAML frontmatter (missing name)', async () => {
    mockReaddir.mockResolvedValue(['broken.md', 'good.md']);
    mockReadFile.mockImplementation((path: string) => {
      if (path.includes('broken.md')) {
        return Promise.resolve('---\ndescription: No name field\nmodel: sonnet\n---\n\nBody.');
      }
      return Promise.resolve(agentMd({ name: 'Good Agent', description: 'Works', model: 'sonnet' }));
    });

    const registry = await loadAgentRegistry('/fake/agents');
    expect(registry).toHaveLength(1);
    expect(registry[0].name).toBe('Good Agent');
  });

  it('skips non-.md files', async () => {
    mockReaddir.mockResolvedValue(['galadriel.md', 'README.txt', '.DS_Store', 'notes.json']);
    mockReadFile.mockResolvedValue(agentMd({ name: 'Galadriel', description: 'UX', model: 'sonnet' }));

    const registry = await loadAgentRegistry('/fake/agents');
    expect(registry).toHaveLength(1);
    expect(mockReadFile).toHaveBeenCalledTimes(1);
  });

  it('uses basename without .md as id', async () => {
    mockReaddir.mockResolvedValue(['kenobi-security.md']);
    mockReadFile.mockResolvedValue(agentMd({ name: 'Kenobi', description: 'Security', model: 'opus' }));

    const registry = await loadAgentRegistry('/fake/agents');
    expect(registry[0].id).toBe('kenobi-security');
  });

  it('defaults model to sonnet when not specified', async () => {
    mockReaddir.mockResolvedValue(['agent.md']);
    mockReadFile.mockResolvedValue('---\nname: NoModel\ndescription: Test\n---\n\nBody.');

    const registry = await loadAgentRegistry('/fake/agents');
    expect(registry[0].model).toBe('sonnet');
  });

  it('handles quoted values in frontmatter', async () => {
    mockReaddir.mockResolvedValue(['agent.md']);
    mockReadFile.mockResolvedValue('---\nname: "Picard"\ndescription: \'Architecture\'\nmodel: opus\n---\n\nBody.');

    const registry = await loadAgentRegistry('/fake/agents');
    expect(registry[0].name).toBe('Picard');
    expect(registry[0].description).toBe('Architecture');
  });

  it('returns empty tools/tags as undefined', async () => {
    mockReaddir.mockResolvedValue(['agent.md']);
    mockReadFile.mockResolvedValue(agentMd({ name: 'Simple', description: 'No tags', model: 'sonnet' }));

    const registry = await loadAgentRegistry('/fake/agents');
    expect(registry[0].tools).toBeUndefined();
    expect(registry[0].tags).toBeUndefined();
  });

  it('handles file without frontmatter delimiters', async () => {
    mockReaddir.mockResolvedValue(['broken.md']);
    mockReadFile.mockResolvedValue('Just plain markdown content. No frontmatter.');

    const registry = await loadAgentRegistry('/fake/agents');
    expect(registry).toHaveLength(0);
  });

  it('returns empty array for empty directory', async () => {
    mockReaddir.mockResolvedValue([]);

    const registry = await loadAgentRegistry('/fake/agents');
    expect(registry).toEqual([]);
  });
});

// ── clearRegistryCache ─────────────────────────────────

describe('clearRegistryCache', () => {
  it('forces filesystem re-read on next call after clearing', async () => {
    mockReaddir.mockResolvedValue(['galadriel.md']);
    mockReadFile.mockResolvedValue(agentMd({ name: 'Galadriel', description: 'UX', model: 'sonnet' }));

    await loadAgentRegistry('/fake/agents');
    expect(mockReaddir).toHaveBeenCalledTimes(1);

    clearRegistryCache();

    await loadAgentRegistry('/fake/agents');
    expect(mockReaddir).toHaveBeenCalledTimes(2);
  });

  it('allows updated data to be loaded after clear', async () => {
    mockReaddir.mockResolvedValue(['agent.md']);
    mockReadFile.mockResolvedValueOnce(agentMd({ name: 'V1', description: 'Old', model: 'sonnet' }));

    const first = await loadAgentRegistry('/fake/agents');
    expect(first[0].name).toBe('V1');

    clearRegistryCache();

    mockReadFile.mockResolvedValueOnce(agentMd({ name: 'V2', description: 'New', model: 'opus' }));

    const second = await loadAgentRegistry('/fake/agents');
    expect(second[0].name).toBe('V2');
  });
});

// ── getRegistrySummary ─────────────────────────────────

describe('getRegistrySummary', () => {
  it('formats one-line-per-agent output', () => {
    const agents: AgentEntry[] = [
      { id: 'galadriel', name: 'Galadriel', description: 'Frontend & UX', model: 'sonnet' },
      { id: 'stark', name: 'Stark', description: 'Backend engineer', model: 'sonnet' },
    ];

    const summary = getRegistrySummary(agents);
    const lines = summary.split('\n');
    expect(lines).toHaveLength(2);
    expect(lines[0]).toBe('galadriel: Frontend & UX');
    expect(lines[1]).toBe('stark: Backend engineer');
  });

  it('includes tags in brackets when present', () => {
    const agents: AgentEntry[] = [
      { id: 'galadriel', name: 'Galadriel', description: 'Frontend & UX', model: 'sonnet', tags: ['frontend', 'ux'] },
    ];

    const summary = getRegistrySummary(agents);
    expect(summary).toBe('galadriel: Frontend & UX [frontend, ux]');
  });

  it('excludes tags bracket when no tags', () => {
    const agents: AgentEntry[] = [
      { id: 'batman', name: 'Batman', description: 'QA investigator', model: 'sonnet' },
    ];

    const summary = getRegistrySummary(agents);
    expect(summary).toBe('batman: QA investigator');
    expect(summary).not.toContain('[');
  });

  it('excludes tags bracket when tags array is empty', () => {
    const agents: AgentEntry[] = [
      { id: 'batman', name: 'Batman', description: 'QA investigator', model: 'sonnet', tags: [] },
    ];

    const summary = getRegistrySummary(agents);
    expect(summary).toBe('batman: QA investigator');
    expect(summary).not.toContain('[');
  });

  it('returns empty string for empty registry', () => {
    const summary = getRegistrySummary([]);
    expect(summary).toBe('');
  });
});
