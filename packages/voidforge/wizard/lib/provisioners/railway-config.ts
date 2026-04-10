/**
 * Railway provisioner — configuration, GraphQL helpers, template deployment,
 * config file generation, and cleanup.
 */

import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { ProvisionContext, ProvisionEmitter, CreatedResource } from './types.js';
import { httpsPost, safeJsonParse } from './http-client.js';
import { recordResourcePending, recordResourceCreated } from '../provision-manifest.js';
import { appendEnvSection } from '../env-writer.js';

/** Execute a Railway GraphQL query. */
export function gql(token: string, query: string, variables?: Record<string, unknown>): Promise<{ status: number; body: string }> {
  const body = JSON.stringify({ query, variables });
  return httpsPost('backboard.railway.com', '/graphql/v2', {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json',
  }, body);
}

export const DEPLOY_POLL_INTERVAL_MS = 5000;
export const DEPLOY_POLL_TIMEOUT_MS = 300_000;

/** Validate Railway provisioner context. */
export function validateRailwayContext(ctx: ProvisionContext): string[] {
  const errors: string[] = [];
  if (!ctx.projectDir) errors.push('Project directory is required');
  if (!ctx.credentials['railway-token']) errors.push('Railway API token is required');
  return errors;
}

/** Deploy a database/redis template or fall back to serviceCreate. */
export async function deployTemplate(
  token: string,
  projectId: string,
  environmentId: string,
  ctx: ProvisionContext,
  resources: CreatedResource[],
  templateName: string,
  resourceLabel: string,
  displayName: string,
  emit: ProvisionEmitter,
): Promise<void> {
  await recordResourcePending(ctx.runId, 'railway-service', `${projectId}-${resourceLabel}`, 'global');

  // Only attempt templateDeploy if we have a valid environment ID
  if (environmentId) {
    try {
      const res = await gql(token, `
        mutation($projectId: String!, $environmentId: String!, $template: String!) {
          templateDeploy(input: {
            projectId: $projectId,
            environmentId: $environmentId,
            services: [{ template: $template, hasDomain: false }]
          }) {
            projectId
            workflowId
          }
        }
      `, { projectId, environmentId, template: templateName });

      if (res.status === 200) {
        const data = safeJsonParse(res.body) as {
          data?: { templateDeploy?: { projectId?: string } };
          errors?: { message: string }[];
        } | null;

        if (!data?.errors || data.errors.length === 0) {
          resources.push({ type: 'railway-service', id: `${projectId}-${resourceLabel}`, region: 'global' });
          await recordResourceCreated(ctx.runId, 'railway-service', `${projectId}-${resourceLabel}`, 'global');
          emit({ step: `railway-${resourceLabel}`, status: 'done', message: `${displayName} deployed via template — connection string available in Railway dashboard` });
          return;
        }
      }
    } catch {
      // Fall through to serviceCreate fallback
    }
  }

  // Fallback: create a bare service (user configures the database image in dashboard)
  const svcRes = await gql(token, `
    mutation($projectId: String!, $name: String!) {
      serviceCreate(input: { projectId: $projectId, name: $name }) {
        id
        name
      }
    }
  `, { projectId, name: `${ctx.projectName}-${templateName}` });

  if (svcRes.status === 200) {
    const svcData = safeJsonParse(svcRes.body) as {
      data?: { serviceCreate?: { id?: string } };
      errors?: { message: string }[];
    } | null;
    const svcId = svcData?.data?.serviceCreate?.id;
    if (svcId) {
      resources.push({ type: 'railway-service', id: svcId, region: 'global' });
      await recordResourceCreated(ctx.runId, 'railway-service', svcId, 'global');
      emit({ step: `railway-${resourceLabel}`, status: 'done', message: `${displayName} service created — configure database image in Railway dashboard` });
    } else {
      emit({ step: `railway-${resourceLabel}`, status: 'error', message: `${displayName} service creation returned no ID`, detail: 'Create the database manually in the Railway dashboard' });
    }
  } else {
    emit({ step: `railway-${resourceLabel}`, status: 'error', message: `Failed to create ${displayName} service (API returned ${svcRes.status})`, detail: 'Create the database manually in the Railway dashboard' });
  }
}

/** Generate railway.toml configuration file. */
export async function generateRailwayConfig(
  ctx: ProvisionContext,
  projectId: string,
  files: string[],
  emit: ProvisionEmitter,
): Promise<void> {
  emit({ step: 'railway-config', status: 'started', message: 'Generating railway.toml' });
  try {
    const framework = ctx.framework || 'express';
    const startCommand = framework === 'next.js'
      ? 'npm run start'
      : framework === 'django'
        ? 'gunicorn config.wsgi:application --bind 0.0.0.0:$PORT'
        : 'node dist/index.js';

    const buildCommand = framework === 'django'
      ? 'pip install -r requirements.txt && python manage.py collectstatic --noinput'
      : 'npm ci && npm run build';

    const config = `# railway.toml — Railway deployment configuration
# Generated by VoidForge
# Deploy with: railway link ${projectId} && railway up

[build]
builder = "nixpacks"
buildCommand = "${buildCommand}"

[deploy]
startCommand = "${startCommand}"
healthcheckPath = "/"
restartPolicyType = "on_failure"
restartPolicyMaxRetries = 3
`;

    await writeFile(join(ctx.projectDir, 'railway.toml'), config, 'utf-8');
    files.push('railway.toml');
    emit({ step: 'railway-config', status: 'done', message: 'Generated railway.toml' });
  } catch (err) {
    emit({ step: 'railway-config', status: 'error', message: 'Failed to write railway.toml', detail: (err as Error).message });
  }
}

/** Write Railway environment details to .env. */
export async function writeRailwayEnv(
  ctx: ProvisionContext,
  projectId: string,
  outputs: Record<string, string>,
  ghOwner: string | undefined,
  emit: ProvisionEmitter,
): Promise<void> {
  emit({ step: 'railway-env', status: 'started', message: 'Writing Railway config to .env' });
  try {
    const envLines = [
      `# VoidForge Railway — generated ${new Date().toISOString()}`,
      `RAILWAY_PROJECT_ID=${projectId}`,
      `RAILWAY_PROJECT_NAME=${outputs['RAILWAY_PROJECT_NAME'] || ctx.projectName}`,
    ];
    if (outputs['DEPLOY_URL']) envLines.push(`DEPLOY_URL=${outputs['DEPLOY_URL']}`);
    envLines.push(ghOwner ? '# Auto-deploys on push to main' : `# Deploy with: railway link ${projectId} && railway up`);
    await appendEnvSection(ctx.projectDir, envLines);
    emit({ step: 'railway-env', status: 'done', message: 'Railway config written to .env' });
  } catch (err) {
    emit({ step: 'railway-env', status: 'error', message: 'Failed to write .env', detail: (err as Error).message });
  }
}

/** Step 7: Poll for Railway deployment completion. */
export async function pollDeployment(
  ctx: ProvisionContext,
  token: string,
  serviceId: string,
  environmentId: string,
  outputs: Record<string, string>,
  ghOwner: string | undefined,
  emit: ProvisionEmitter,
): Promise<void> {
  if (!serviceId || !environmentId) {
    if (!ghOwner) {
      emit({ step: 'railway-deploy', status: 'skipped', message: 'No GitHub repo linked — deploy manually with: railway link && railway up' });
    }
    return;
  }

  emit({ step: 'railway-deploy', status: 'started', message: 'Waiting for Railway deployment...' });
  try {
    const start = Date.now();
    let deployUrl = '';
    while (Date.now() - start < DEPLOY_POLL_TIMEOUT_MS) {
      await new Promise(r => setTimeout(r, DEPLOY_POLL_INTERVAL_MS));
      if (ctx.abortSignal?.aborted) break;

      const depRes = await gql(token, `
        query($serviceId: String!) {
          service(id: $serviceId) {
            serviceInstances { edges { node {
              domains { serviceDomains { domain } }
              latestDeployment { status }
            } } }
          }
        }
      `, { serviceId });

      if (depRes.status === 200) {
        const depData = safeJsonParse(depRes.body) as {
          data?: { service?: { serviceInstances?: { edges: { node: { domains?: { serviceDomains?: { domain: string }[] }; latestDeployment?: { status: string } } }[] } } };
        } | null;
        const instance = depData?.data?.service?.serviceInstances?.edges?.[0]?.node;
        const deployStatus = instance?.latestDeployment?.status;
        const domain = instance?.domains?.serviceDomains?.[0]?.domain;

        if (deployStatus === 'SUCCESS' && domain) {
          deployUrl = `https://${domain}`;
          break;
        }
        if (deployStatus === 'FAILED' || deployStatus === 'CRASHED') {
          emit({ step: 'railway-deploy', status: 'error', message: `Deployment ${deployStatus.toLowerCase()} — check Railway dashboard` });
          break;
        }
      }

      const elapsed = Math.round((Date.now() - start) / 1000);
      if (elapsed % 15 === 0) {
        emit({ step: 'railway-deploy', status: 'started', message: `Waiting for deployment... (${elapsed}s)` });
      }
    }

    if (deployUrl) {
      outputs['DEPLOY_URL'] = deployUrl;
      if (!outputs['RAILWAY_CUSTOM_DOMAIN']) {
        outputs['RAILWAY_DOMAIN'] = deployUrl.replace('https://', '');
      }
      emit({ step: 'railway-deploy', status: 'done', message: `Live at ${deployUrl}` });
    } else if (!ctx.abortSignal?.aborted) {
      emit({ step: 'railway-deploy', status: 'error', message: 'Deployment polling timed out — check Railway dashboard' });
    }
  } catch (err) {
    emit({ step: 'railway-deploy', status: 'error', message: 'Failed to poll deployment', detail: (err as Error).message });
  }
}

/** Delete Railway project (services are deleted with it). */
export async function cleanupRailway(
  resources: CreatedResource[],
  credentials: Record<string, string>,
): Promise<void> {
  const token = credentials['railway-token'];
  if (!token) return;

  for (const resource of resources) {
    if (resource.type === 'railway-project') {
      try {
        await gql(token, `
          mutation($id: String!) {
            projectDelete(id: $id)
          }
        `, { id: resource.id });
      } catch (err) {
        console.error(`Failed to delete Railway project ${resource.id}:`, (err as Error).message);
      }
    }
    // Plugins are deleted with the project — no need to delete separately
  }
}
