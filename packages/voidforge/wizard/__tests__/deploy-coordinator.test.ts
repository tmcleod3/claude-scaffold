/**
 * Deploy coordinator tests — linked group deploy checks, plan generation, linked summaries.
 * Mocks project-registry and audit-log to avoid filesystem access.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../lib/project-registry.js', () => ({
  getLinkedGroup: vi.fn(),
  getProject: vi.fn(),
}));

vi.mock('../lib/audit-log.js', () => ({
  audit: vi.fn(async () => {}),
}));

const { getLinkedGroup, getProject } = await import('../lib/project-registry.js');
const { checkDeployNeeded, getDeployPlan, getLinkedSummary } = await import('../lib/deploy-coordinator.js');

const mockGetLinkedGroup = getLinkedGroup as ReturnType<typeof vi.fn>;
const mockGetProject = getProject as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
});

describe('checkDeployNeeded', () => {
  it('returns null when no linked group', async () => {
    mockGetLinkedGroup.mockResolvedValue([]);
    const result = await checkDeployNeeded('p1');
    expect(result).toBeNull();
  });

  it('marks never-deployed projects as needing deploy', async () => {
    mockGetLinkedGroup.mockResolvedValue([
      { id: 'p1', name: 'Frontend', deployTarget: 'vercel', lastDeployAt: '', lastBuildPhase: 3 },
    ]);

    const result = await checkDeployNeeded('p1');
    expect(result).not.toBeNull();
    expect(result!.linkedProjects[0].needsDeploy).toBe(true);
    expect(result!.linkedProjects[0].reason).toContain('Never deployed');
  });

  it('marks projects without deploy target as not needing deploy', async () => {
    mockGetLinkedGroup.mockResolvedValue([
      { id: 'p1', name: 'Lib', deployTarget: 'unknown', lastDeployAt: '', lastBuildPhase: 0 },
    ]);

    const result = await checkDeployNeeded('p1');
    expect(result!.linkedProjects[0].needsDeploy).toBe(false);
    expect(result!.linkedProjects[0].reason).toContain('No deploy target');
  });

  it('counts total needing deploy', async () => {
    mockGetLinkedGroup.mockResolvedValue([
      { id: 'p1', name: 'A', deployTarget: 'vps', lastDeployAt: '', lastBuildPhase: 1 },
      { id: 'p2', name: 'B', deployTarget: 'vps', lastDeployAt: new Date().toISOString(), lastBuildPhase: 0 },
    ]);

    const result = await checkDeployNeeded('p1');
    expect(result!.totalNeedingDeploy).toBe(1);
  });
});

describe('getDeployPlan', () => {
  it('returns null when no linked group', async () => {
    mockGetLinkedGroup.mockResolvedValue([]);
    const result = await getDeployPlan('p1', 'admin', '127.0.0.1');
    expect(result).toBeNull();
  });

  it('returns plan with audit trail', async () => {
    mockGetLinkedGroup.mockResolvedValue([
      { id: 'p1', name: 'App', deployTarget: 'vercel', lastDeployAt: '', lastBuildPhase: 1 },
    ]);

    const { audit } = await import('../lib/audit-log.js');
    const result = await getDeployPlan('p1', 'admin', '127.0.0.1');
    expect(result).not.toBeNull();
    expect(audit).toHaveBeenCalled();
  });
});

describe('getLinkedSummary', () => {
  it('returns empty when project has no linked projects', async () => {
    mockGetProject.mockResolvedValue({ id: 'p1', linkedProjects: [] });
    const summary = await getLinkedSummary('p1');
    expect(summary.linkedCount).toBe(0);
    expect(summary.linkedNames).toEqual([]);
  });

  it('returns empty when project does not exist', async () => {
    mockGetProject.mockResolvedValue(null);
    const summary = await getLinkedSummary('missing');
    expect(summary.linkedCount).toBe(0);
  });

  it('returns linked project names excluding self', async () => {
    mockGetProject.mockResolvedValue({ id: 'p1', linkedProjects: ['p2', 'p3'] });
    mockGetLinkedGroup.mockResolvedValue([
      { id: 'p1', name: 'Frontend' },
      { id: 'p2', name: 'Backend' },
      { id: 'p3', name: 'Worker' },
    ]);

    const summary = await getLinkedSummary('p1');
    expect(summary.linkedCount).toBe(2);
    expect(summary.linkedNames).toEqual(['Backend', 'Worker']);
  });
});
