/**
 * Railway provisioner — orchestrator that coordinates project creation,
 * service deployment, config generation, and cleanup.
 */

import type { Provisioner, ProvisionContext, ProvisionEmitter, ProvisionResult, CreatedResource } from './types.js';
import { validateRailwayContext, generateRailwayConfig, writeRailwayEnv, cleanupRailway, pollDeployment } from './railway-config.js';
import {
  createProject, fetchEnvironmentId, addDatabaseService,
  addRedisService, createGitHubService, addCustomDomain,
  setEnvironmentVariables,
} from './railway-deploy.js';

export const railwayProvisioner: Provisioner = {
  async validate(ctx: ProvisionContext): Promise<string[]> {
    return validateRailwayContext(ctx);
  },

  async provision(ctx: ProvisionContext, emit: ProvisionEmitter): Promise<ProvisionResult> {
    const files: string[] = [];
    const resources: CreatedResource[] = [];
    const outputs: Record<string, string> = {};
    const token = ctx.credentials['railway-token'];
    const ghOwner = ctx.credentials['_github-owner'];

    // Step 1: Create Railway project
    const projectId = await createProject(ctx, token, resources, outputs, emit);
    if (!projectId) {
      return { success: false, resources, outputs, files, error: outputs['error'] || 'Failed to create Railway project' };
    }

    // Fetch the default environment ID — shared by all subsequent steps
    const environmentId = await fetchEnvironmentId(token, projectId, emit);

    // Step 2: Add database service if requested
    await addDatabaseService(ctx, token, projectId, environmentId, resources, outputs, emit);

    // Step 3: Add Redis service if cache requested
    await addRedisService(ctx, token, projectId, environmentId, resources, emit);

    // Step 4: Create service with GitHub source
    const serviceId = await createGitHubService(ctx, token, projectId, resources, emit);

    // Step 5: Add custom domain
    await addCustomDomain(ctx, token, projectId, serviceId, environmentId, outputs, emit);

    // Step 6: Set environment variables
    await setEnvironmentVariables(ctx, token, projectId, serviceId, environmentId, emit);

    // Step 7: Poll for deployment
    await pollDeployment(ctx, token, serviceId, environmentId, outputs, ghOwner, emit);

    // Step 8: Generate railway.toml
    await generateRailwayConfig(ctx, projectId, files, emit);

    // Step 9: Write .env
    await writeRailwayEnv(ctx, projectId, outputs, ghOwner, emit);

    return { success: true, resources, outputs, files };
  },

  async cleanup(resources: CreatedResource[], credentials: Record<string, string>): Promise<void> {
    await cleanupRailway(resources, credentials);
  },
};
