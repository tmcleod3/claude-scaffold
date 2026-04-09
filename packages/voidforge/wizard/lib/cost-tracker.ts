/**
 * Cost Tracker — Aggregate monthly costs across projects.
 *
 * Reads from the project registry's existing monthlyCost field.
 * No separate store — data lives where it's already maintained.
 */

import { readRegistry, getProjectsForUser, updateProject } from './project-registry.js';

export interface ProjectCost {
  projectId: string;
  name: string;
  monthlyCost: number;
  deployTarget: string;
}

export interface AggregateCosts {
  totalMonthlyCost: number;
  projects: ProjectCost[];
  alertThreshold: number;
  isOverThreshold: boolean;
}

const DEFAULT_ALERT_THRESHOLD = 100; // $100/mo

/**
 * Get aggregate costs for all projects visible to a user.
 * Admins see all projects; others see owned + shared.
 */
export async function getAggregateCosts(
  username: string,
  globalRole: string,
  alertThreshold = DEFAULT_ALERT_THRESHOLD,
): Promise<AggregateCosts> {
  const projects = await getProjectsForUser(username, globalRole);

  const costs: ProjectCost[] = projects.map((p) => ({
    projectId: p.id,
    name: p.name,
    monthlyCost: p.monthlyCost || 0,
    deployTarget: p.deployTarget,
  }));

  const totalMonthlyCost = costs.reduce((sum, c) => sum + c.monthlyCost, 0);

  return {
    totalMonthlyCost,
    projects: costs,
    alertThreshold,
    isOverThreshold: totalMonthlyCost > alertThreshold,
  };
}

/**
 * Update monthly cost for a project (called after deploy or manual update).
 */
export async function setProjectCost(
  projectId: string,
  monthlyCost: number,
): Promise<void> {
  if (!Number.isFinite(monthlyCost) || monthlyCost < 0) {
    throw new Error('monthlyCost must be a non-negative finite number');
  }
  await updateProject(projectId, { monthlyCost });
}
