/**
 * Tests for project-scope.ts — ProjectContext creation and resolveProject middleware.
 * v22.0.x P2-A: Zero-coverage gap identified by Batman + Constantine in Muster review.
 */

import { describe, it, expect } from 'vitest';
import { createProjectContext } from '../lib/project-scope.js';
import type { Project } from '../lib/project-registry.js';
import { join } from 'node:path';

const mockProject: Project = {
  id: 'test-123',
  name: 'Test Project',
  directory: '/tmp/test-project',
  deployTarget: 'vps',
  deployUrl: 'https://test.example.com',
  sshHost: '',
  framework: 'next.js',
  database: 'postgres',
  createdAt: '2026-04-01T00:00:00Z',
  lastBuildPhase: 5,
  lastDeployAt: '',
  healthCheckUrl: '',
  monthlyCost: 0,
  healthStatus: 'unchecked',
  healthCheckedAt: '',
  owner: 'admin',
  access: [],
  linkedProjects: [],
};

describe('createProjectContext', () => {
  it('creates context with correct derived paths', () => {
    const ctx = createProjectContext(mockProject);

    expect(ctx.id).toBe('test-123');
    expect(ctx.name).toBe('Test Project');
    expect(ctx.directory).toBe('/tmp/test-project');
    expect(ctx.logsDir).toBe(join('/tmp/test-project', 'logs'));
    expect(ctx.cultivationDir).toBe(join('/tmp/test-project', 'cultivation'));
    expect(ctx.treasuryDir).toBe(join('/tmp/test-project', 'cultivation', 'treasury'));
    expect(ctx.spendLog).toBe(join('/tmp/test-project', 'cultivation', 'treasury', 'spend-log.jsonl'));
    expect(ctx.revenueLog).toBe(join('/tmp/test-project', 'cultivation', 'treasury', 'revenue-log.jsonl'));
    expect(ctx.pendingOps).toBe(join('/tmp/test-project', 'cultivation', 'treasury', 'pending-ops.jsonl'));
    expect(ctx.budgetsFile).toBe(join('/tmp/test-project', 'cultivation', 'treasury', 'budgets.json'));
    expect(ctx.campaignsDir).toBe(join('/tmp/test-project', 'cultivation', 'treasury', 'campaigns'));
    expect(ctx.pidFile).toBe(join('/tmp/test-project', 'cultivation', 'heartbeat.pid'));
    expect(ctx.socketPath).toBe(join('/tmp/test-project', 'cultivation', 'heartbeat.sock'));
    expect(ctx.stateFile).toBe(join('/tmp/test-project', 'cultivation', 'heartbeat.json'));
    expect(ctx.logFile).toBe(join('/tmp/test-project', 'cultivation', 'heartbeat.log'));
    expect(ctx.tokenFile).toBe(join('/tmp/test-project', 'cultivation', 'heartbeat.token'));
  });

  it('preserves the full project record', () => {
    const ctx = createProjectContext(mockProject);
    expect(ctx.project).toBe(mockProject);
    expect(ctx.project.framework).toBe('next.js');
  });

  it('handles paths with spaces', () => {
    const project = { ...mockProject, directory: '/Users/Test User/My Project' };
    const ctx = createProjectContext(project);
    expect(ctx.logsDir).toBe(join('/Users/Test User/My Project', 'logs'));
    expect(ctx.treasuryDir).toContain('My Project');
  });
});
