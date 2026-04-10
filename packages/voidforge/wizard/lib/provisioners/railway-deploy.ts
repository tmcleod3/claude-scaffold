/**
 * Railway provisioner — deployment logic: project creation, service management,
 * GitHub linking, custom domains, environment variables, and deploy polling.
 */

import type { ProvisionContext, ProvisionEmitter, CreatedResource } from './types.js';
import { safeJsonParse } from './http-client.js';
import { recordResourcePending, recordResourceCreated } from '../provision-manifest.js';
import { gql, deployTemplate } from './railway-config.js';

/** Step 1: Create Railway project. Returns projectId or null on failure. */
export async function createProject(
  ctx: ProvisionContext,
  token: string,
  resources: CreatedResource[],
  outputs: Record<string, string>,
  emit: ProvisionEmitter,
): Promise<string | null> {
  emit({ step: 'railway-project', status: 'started', message: 'Creating Railway project' });
  try {
    await recordResourcePending(ctx.runId, 'railway-project', ctx.projectName, 'global');

    const res = await gql(token, `
      mutation($name: String!) {
        projectCreate(input: { name: $name }) {
          id
          name
        }
      }
    `, { name: ctx.projectName });

    if (res.status !== 200) {
      throw new Error(`Railway API returned ${res.status}`);
    }

    const data = safeJsonParse(res.body) as {
      data?: { projectCreate?: { id?: string; name?: string } };
      errors?: { message: string }[];
    };

    if (data.errors && data.errors.length > 0) {
      throw new Error(data.errors[0].message);
    }

    const projectId = data.data?.projectCreate?.id ?? '';
    if (!projectId) throw new Error('No project ID returned');

    resources.push({ type: 'railway-project', id: projectId, region: 'global' });
    await recordResourceCreated(ctx.runId, 'railway-project', projectId, 'global');
    outputs['RAILWAY_PROJECT_ID'] = projectId;
    outputs['RAILWAY_PROJECT_NAME'] = data.data?.projectCreate?.name ?? ctx.projectName;
    emit({ step: 'railway-project', status: 'done', message: `Project "${outputs['RAILWAY_PROJECT_NAME']}" created on Railway` });
    return projectId;
  } catch (err) {
    emit({ step: 'railway-project', status: 'error', message: 'Failed to create Railway project', detail: (err as Error).message });
    return null;
  }
}

/** Fetch the default environment ID for a Railway project. */
export async function fetchEnvironmentId(
  token: string,
  projectId: string,
  emit: ProvisionEmitter,
): Promise<string> {
  try {
    const envRes = await gql(token, `
      query($projectId: String!) {
        project(id: $projectId) {
          environments { edges { node { id name } } }
        }
      }
    `, { projectId });
    if (envRes.status === 200) {
      const envData = safeJsonParse(envRes.body) as {
        data?: { project?: { environments?: { edges: { node: { id: string; name: string } }[] } } };
      } | null;
      const edges = envData?.data?.project?.environments?.edges ?? [];
      const prodEnv = edges.find(e => e.node.name === 'production') || edges[0];
      return prodEnv?.node.id ?? '';
    }
  } catch {
    emit({ step: 'railway-env', status: 'error', message: 'Could not fetch project environment — database/redis services will use fallback creation', detail: 'Environment query failed' });
  }
  return '';
}

/** Step 2: Add database service if requested (ADR-019: template services). */
export async function addDatabaseService(
  ctx: ProvisionContext,
  token: string,
  projectId: string,
  environmentId: string,
  resources: CreatedResource[],
  outputs: Record<string, string>,
  emit: ProvisionEmitter,
): Promise<void> {
  if (ctx.database === 'postgres' || ctx.database === 'mysql') {
    const dbType = ctx.database === 'postgres' ? 'Postgres' : 'MySQL';
    const templateName = ctx.database === 'postgres' ? 'postgres' : 'mysql';
    emit({ step: 'railway-db', status: 'started', message: `Adding ${dbType} service to Railway project` });
    try {
      await deployTemplate(token, projectId, environmentId, ctx, resources, templateName, 'db', dbType, emit);
      outputs['RAILWAY_DB_TYPE'] = dbType;
    } catch (err) {
      emit({ step: 'railway-db', status: 'error', message: `Failed to add ${dbType} service`, detail: (err as Error).message });
    }
  } else {
    emit({ step: 'railway-db', status: 'skipped', message: ctx.database === 'sqlite' ? 'SQLite — no remote database service needed' : 'No database requested' });
  }
}

/** Step 3: Add Redis service if cache requested (ADR-019: template services). */
export async function addRedisService(
  ctx: ProvisionContext,
  token: string,
  projectId: string,
  environmentId: string,
  resources: CreatedResource[],
  emit: ProvisionEmitter,
): Promise<void> {
  if (ctx.cache === 'redis') {
    emit({ step: 'railway-redis', status: 'started', message: 'Adding Redis service to Railway project' });
    try {
      await deployTemplate(token, projectId, environmentId, ctx, resources, 'redis', 'redis', 'Redis', emit);
    } catch (err) {
      emit({ step: 'railway-redis', status: 'error', message: 'Failed to add Redis service', detail: (err as Error).message });
    }
  } else {
    emit({ step: 'railway-redis', status: 'skipped', message: 'No cache requested' });
  }
}

/** Step 4: Create service with GitHub source (ADR-015). Returns serviceId. */
export async function createGitHubService(
  ctx: ProvisionContext,
  token: string,
  projectId: string,
  resources: CreatedResource[],
  emit: ProvisionEmitter,
): Promise<string> {
  const ghOwner = ctx.credentials['_github-owner'];
  const ghRepo = ctx.credentials['_github-repo-name'];

  if (!projectId || !ghOwner || !ghRepo) return '';

  emit({ step: 'railway-service', status: 'started', message: `Creating service linked to ${ghOwner}/${ghRepo}` });
  try {
    const svcRes = await gql(token, `
      mutation($projectId: String!, $repo: String!) {
        serviceCreate(input: {
          projectId: $projectId,
          source: { repo: $repo }
        }) {
          id
          name
        }
      }
    `, { projectId, repo: `${ghOwner}/${ghRepo}` });

    if (svcRes.status === 200) {
      const svcData = safeJsonParse(svcRes.body) as {
        data?: { serviceCreate?: { id?: string; name?: string } };
        errors?: { message: string }[];
      } | null;
      if (svcData?.errors?.length) {
        emit({ step: 'railway-service', status: 'error', message: 'Failed to create service', detail: svcData.errors[0].message });
        return '';
      }
      const serviceId = svcData?.data?.serviceCreate?.id ?? '';
      if (serviceId) {
        resources.push({ type: 'railway-service', id: serviceId, region: 'global' });
        await recordResourceCreated(ctx.runId, 'railway-service', serviceId, 'global');
      }
      emit({ step: 'railway-service', status: 'done', message: 'Service created — linked to GitHub repo' });
      return serviceId;
    }
  } catch (err) {
    emit({ step: 'railway-service', status: 'error', message: 'Failed to create service', detail: (err as Error).message });
  }
  return '';
}

/** Step 5: Add custom domain to Railway service. */
export async function addCustomDomain(
  ctx: ProvisionContext,
  token: string,
  projectId: string,
  serviceId: string,
  environmentId: string,
  outputs: Record<string, string>,
  emit: ProvisionEmitter,
): Promise<void> {
  if (ctx.hostname && projectId && serviceId && environmentId) {
    emit({ step: 'railway-domain', status: 'started', message: `Adding domain ${ctx.hostname} to Railway service` });
    try {
      const domRes = await gql(token, `
        mutation($projectId: String!, $environmentId: String!, $serviceId: String!, $domain: String!) {
          customDomainCreate(input: { projectId: $projectId, environmentId: $environmentId, serviceId: $serviceId, domain: $domain }) {
            id
            domain
          }
        }
      `, { projectId, environmentId, serviceId, domain: ctx.hostname });

      if (domRes.status !== 200) throw new Error(`Railway API returned ${domRes.status}`);

      const domData = safeJsonParse(domRes.body) as {
        data?: { customDomainCreate?: { domain?: string } };
        errors?: { message: string }[];
      };

      if (domData?.errors && domData.errors.length > 0) {
        throw new Error(domData.errors[0].message);
      }

      const domain = domData?.data?.customDomainCreate?.domain ?? ctx.hostname;
      outputs['RAILWAY_CUSTOM_DOMAIN'] = domain;
      emit({ step: 'railway-domain', status: 'done', message: `Domain "${domain}" added to Railway service` });
    } catch (err) {
      emit({ step: 'railway-domain', status: 'error', message: 'Failed to add domain to Railway', detail: (err as Error).message });
    }
  } else if (ctx.hostname && projectId && (!serviceId || !environmentId)) {
    emit({ step: 'railway-domain', status: 'skipped', message: 'Cannot add domain — service or environment not available. Add domain manually in Railway dashboard.' });
  }
}

/** Step 6: Set environment variables on the service. */
export async function setEnvironmentVariables(
  ctx: ProvisionContext,
  token: string,
  projectId: string,
  serviceId: string,
  environmentId: string,
  emit: ProvisionEmitter,
): Promise<void> {
  if (!serviceId || !environmentId) return;

  emit({ step: 'railway-envvars', status: 'started', message: 'Setting environment variables' });
  try {
    const variables: Record<string, string> = {};
    if (ctx.database === 'postgres' || ctx.database === 'mysql') {
      variables['DATABASE_URL'] = ctx.database === 'postgres'
        ? '${{Postgres.DATABASE_URL}}'
        : '${{MySQL.DATABASE_URL}}';
    }
    if (ctx.cache === 'redis') {
      variables['REDIS_URL'] = '${{Redis.REDIS_URL}}';
    }

    if (Object.keys(variables).length > 0) {
      await gql(token, `
        mutation($input: VariableCollectionUpsertInput!) {
          variableCollectionUpsert(input: $input)
        }
      `, {
        input: {
          projectId,
          serviceId,
          environmentId,
          variables,
        },
      });
      emit({ step: 'railway-envvars', status: 'done', message: `Set ${Object.keys(variables).length} environment variables` });
    } else {
      emit({ step: 'railway-envvars', status: 'done', message: 'No environment variables to set' });
    }
  } catch (err) {
    emit({ step: 'railway-envvars', status: 'error', message: 'Failed to set env vars', detail: (err as Error).message });
  }
}

