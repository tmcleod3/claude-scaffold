/**
 * Cost tracker tests — aggregate cost calculation and per-project cost updates.
 * Mocks project-registry to avoid filesystem access.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../lib/project-registry.js', () => ({
  readRegistry: vi.fn(),
  getProjectsForUser: vi.fn(),
  updateProject: vi.fn(async () => {}),
}));

const { getProjectsForUser, updateProject } = await import('../lib/project-registry.js');
const { getAggregateCosts, setProjectCost } = await import('../lib/cost-tracker.js');

const mockGetProjects = getProjectsForUser as ReturnType<typeof vi.fn>;
const mockUpdateProject = updateProject as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
});

describe('getAggregateCosts', () => {
  it('returns zero total when no projects exist', async () => {
    mockGetProjects.mockResolvedValue([]);

    const result = await getAggregateCosts('admin', 'admin');
    expect(result.totalMonthlyCost).toBe(0);
    expect(result.projects).toEqual([]);
    expect(result.isOverThreshold).toBe(false);
  });

  it('aggregates costs across projects', async () => {
    mockGetProjects.mockResolvedValue([
      { id: 'p1', name: 'App 1', monthlyCost: 50, deployTarget: 'vps' },
      { id: 'p2', name: 'App 2', monthlyCost: 30, deployTarget: 'railway' },
    ]);

    const result = await getAggregateCosts('admin', 'admin');
    expect(result.totalMonthlyCost).toBe(80);
    expect(result.projects).toHaveLength(2);
    expect(result.isOverThreshold).toBe(false); // Default threshold is $100
  });

  it('detects over-threshold costs', async () => {
    mockGetProjects.mockResolvedValue([
      { id: 'p1', name: 'App 1', monthlyCost: 80, deployTarget: 'vps' },
      { id: 'p2', name: 'App 2', monthlyCost: 60, deployTarget: 'vps' },
    ]);

    const result = await getAggregateCosts('admin', 'admin', 100);
    expect(result.totalMonthlyCost).toBe(140);
    expect(result.isOverThreshold).toBe(true);
    expect(result.alertThreshold).toBe(100);
  });

  it('treats missing monthlyCost as zero', async () => {
    mockGetProjects.mockResolvedValue([
      { id: 'p1', name: 'App 1', deployTarget: 'vercel' },
    ]);

    const result = await getAggregateCosts('admin', 'admin');
    expect(result.totalMonthlyCost).toBe(0);
  });
});

describe('setProjectCost', () => {
  it('updates project cost via registry', async () => {
    await setProjectCost('p1', 42.50);
    expect(mockUpdateProject).toHaveBeenCalledWith('p1', { monthlyCost: 42.50 });
  });

  it('throws on negative cost', async () => {
    await expect(setProjectCost('p1', -10)).rejects.toThrow('non-negative');
  });

  it('throws on NaN cost', async () => {
    await expect(setProjectCost('p1', NaN)).rejects.toThrow('non-negative finite');
  });

  it('throws on Infinity cost', async () => {
    await expect(setProjectCost('p1', Infinity)).rejects.toThrow('non-negative finite');
  });

  it('accepts zero cost', async () => {
    await setProjectCost('p1', 0);
    expect(mockUpdateProject).toHaveBeenCalledWith('p1', { monthlyCost: 0 });
  });
});
