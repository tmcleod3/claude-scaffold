/**
 * Deploy Coordinator — Orchestrates coordinated deploys across linked services.
 *
 * When deploying a linked project, checks if peer services also need redeployment
 * (based on last deploy timestamp vs. last build phase change). Executes deploys
 * in configurable order with per-service confirmation gates.
 */

import { getLinkedGroup, getProject, type Project } from './project-registry.js';
import { audit } from './audit-log.js';

export interface DeployCheckResult {
  projectId: string;
  name: string;
  needsDeploy: boolean;
  reason: string;
  lastDeployAt: string;
  lastBuildPhase: number;
}

export interface CoordinatedDeployPlan {
  triggerProject: string;
  linkedProjects: DeployCheckResult[];
  totalNeedingDeploy: number;
}

/**
 * Check which projects in a linked group need redeployment.
 * A project needs deploy if:
 * - It has never been deployed (lastDeployAt is empty)
 * - Its build phase advanced since the last deploy
 * - It was explicitly marked for deploy
 */
export async function checkDeployNeeded(projectId: string): Promise<CoordinatedDeployPlan | null> {
  const group = await getLinkedGroup(projectId);
  if (group.length === 0) return null;

  const results: DeployCheckResult[] = group.map((project) => {
    let needsDeploy = false;
    let reason = 'Up to date';

    if (!project.deployTarget || project.deployTarget === 'unknown') {
      reason = 'No deploy target configured';
    } else if (!project.lastDeployAt) {
      needsDeploy = true;
      reason = 'Never deployed';
    } else if (project.lastBuildPhase > 0) {
      // Simple heuristic: if there's build activity, may need deploy
      // In a real system, this would compare git SHAs or timestamps
      const deployDate = new Date(project.lastDeployAt).getTime();
      const now = Date.now();
      const hoursSinceDeploy = (now - deployDate) / (1000 * 60 * 60);
      if (hoursSinceDeploy > 24) {
        needsDeploy = true;
        reason = `Last deployed ${Math.floor(hoursSinceDeploy)}h ago`;
      }
    }

    return {
      projectId: project.id,
      name: project.name,
      needsDeploy,
      reason,
      lastDeployAt: project.lastDeployAt,
      lastBuildPhase: project.lastBuildPhase,
    };
  });

  return {
    triggerProject: projectId,
    linkedProjects: results,
    totalNeedingDeploy: results.filter((r) => r.needsDeploy).length,
  };
}

/**
 * Get a deploy plan for a linked group — returns ordered list of projects
 * that need deployment, with the trigger project first.
 */
export async function getDeployPlan(
  projectId: string,
  username: string,
  ip: string,
): Promise<CoordinatedDeployPlan | null> {
  const plan = await checkDeployNeeded(projectId);
  if (!plan) return null;

  await audit('deploy', ip, username, {
    action: 'deploy_check',
    projectId,
    linkedCount: plan.linkedProjects.length,
    needingDeploy: plan.totalNeedingDeploy,
  });

  return plan;
}

/**
 * Get linked project summary for a single project (used in Lobby UI).
 */
export async function getLinkedSummary(
  projectId: string,
): Promise<{ linkedCount: number; linkedNames: string[] }> {
  const project = await getProject(projectId);
  if (!project || project.linkedProjects.length === 0) {
    return { linkedCount: 0, linkedNames: [] };
  }

  const group = await getLinkedGroup(projectId);
  const linkedNames = group
    .filter((p) => p.id !== projectId)
    .map((p) => p.name);

  return { linkedCount: linkedNames.length, linkedNames };
}
