/**
 * Railway provisioner — creates a real Railway project via GraphQL API + generates railway.toml.
 * v3.8.0: Creates service with GitHub source, sets env vars, polls deploy (ADR-015).
 */

import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Provisioner, ProvisionContext, ProvisionEmitter, ProvisionResult, CreatedResource } from './types.js';
import { httpsPost, safeJsonParse } from './http-client.js';
import { recordResourcePending, recordResourceCreated } from '../provision-manifest.js';
import { appendEnvSection } from '../env-writer.js';

const DEPLOY_POLL_INTERVAL_MS = 5000;
const DEPLOY_POLL_TIMEOUT_MS = 300_000;

function gql(token: string, query: string, variables?: Record<string, unknown>): Promise<{ status: number; body: string }> {
  const body = JSON.stringify({ query, variables });
  return httpsPost('backboard.railway.com', '/graphql/v2', {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json',
  }, body);
}

export const railwayProvisioner: Provisioner = {
  async validate(ctx: ProvisionContext): Promise<string[]> {
    const errors: string[] = [];
    if (!ctx.projectDir) errors.push('Project directory is required');
    if (!ctx.credentials['railway-token']) errors.push('Railway API token is required');
    return errors;
  },

  async provision(ctx: ProvisionContext, emit: ProvisionEmitter): Promise<ProvisionResult> {
    const files: string[] = [];
    const resources: CreatedResource[] = [];
    const outputs: Record<string, string> = {};
    const token = ctx.credentials['railway-token'];
    const framework = ctx.framework || 'express';

    // Step 1: Create Railway project
    emit({ step: 'railway-project', status: 'started', message: 'Creating Railway project' });
    let projectId = '';
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

      projectId = data.data?.projectCreate?.id ?? '';
      if (!projectId) throw new Error('No project ID returned');

      resources.push({ type: 'railway-project', id: projectId, region: 'global' });
      await recordResourceCreated(ctx.runId, 'railway-project', projectId, 'global');
      outputs['RAILWAY_PROJECT_ID'] = projectId;
      outputs['RAILWAY_PROJECT_NAME'] = data.data?.projectCreate?.name ?? ctx.projectName;
      emit({ step: 'railway-project', status: 'done', message: `Project "${outputs['RAILWAY_PROJECT_NAME']}" created on Railway` });
    } catch (err) {
      emit({ step: 'railway-project', status: 'error', message: 'Failed to create Railway project', detail: (err as Error).message });
      return { success: false, resources, outputs, files, error: (err as Error).message };
    }

    // Step 2: Add Postgres plugin if database requested
    if (ctx.database === 'postgres' || ctx.database === 'mysql') {
      const dbType = ctx.database === 'postgres' ? 'postgresql' : 'mysql';
      emit({ step: 'railway-db', status: 'started', message: `Adding ${dbType} service to Railway project` });
      try {
        await recordResourcePending(ctx.runId, 'railway-plugin', `${projectId}-db`, 'global');

        const res = await gql(token, `
          mutation($projectId: String!, $plugin: String!) {
            pluginCreate(input: { projectId: $projectId, plugin: $plugin }) {
              id
              name
            }
          }
        `, { projectId, plugin: dbType });

        if (res.status !== 200) throw new Error(`Railway API returned ${res.status}`);

        const data = safeJsonParse(res.body) as {
          data?: { pluginCreate?: { id?: string } };
          errors?: { message: string }[];
        } | null;

        if (data?.errors && data.errors.length > 0) {
          throw new Error(data.errors[0].message);
        }

        const pluginId = data?.data?.pluginCreate?.id ?? '';
        if (pluginId) {
          resources.push({ type: 'railway-plugin', id: pluginId, region: 'global' });
          await recordResourceCreated(ctx.runId, 'railway-plugin', pluginId, 'global');
        }
        outputs['RAILWAY_DB_PLUGIN'] = dbType;
        emit({ step: 'railway-db', status: 'done', message: `${dbType} service added — connection string available in Railway dashboard` });
      } catch (err) {
        emit({ step: 'railway-db', status: 'error', message: `Failed to add ${dbType} service`, detail: 'Railway may have deprecated this API. Create the database manually in the Railway dashboard.' });
        // Non-fatal
      }
    } else {
      emit({ step: 'railway-db', status: 'skipped', message: 'No database requested' });
    }

    // Step 3: Add Redis plugin if cache requested
    if (ctx.cache === 'redis') {
      emit({ step: 'railway-redis', status: 'started', message: 'Adding Redis service to Railway project' });
      try {
        await recordResourcePending(ctx.runId, 'railway-plugin', `${projectId}-redis`, 'global');

        const res = await gql(token, `
          mutation($projectId: String!, $plugin: String!) {
            pluginCreate(input: { projectId: $projectId, plugin: $plugin }) {
              id
            }
          }
        `, { projectId, plugin: 'redis' });

        if (res.status !== 200) throw new Error(`Railway API returned ${res.status}`);

        const data = safeJsonParse(res.body) as {
          data?: { pluginCreate?: { id?: string } };
          errors?: { message: string }[];
        } | null;

        if (data?.errors && data.errors.length > 0) {
          throw new Error(data.errors[0].message);
        }

        const pluginId = data?.data?.pluginCreate?.id ?? '';
        if (pluginId) {
          resources.push({ type: 'railway-plugin', id: pluginId, region: 'global' });
          await recordResourceCreated(ctx.runId, 'railway-plugin', pluginId, 'global');
        }
        emit({ step: 'railway-redis', status: 'done', message: 'Redis service added' });
      } catch (err) {
        emit({ step: 'railway-redis', status: 'error', message: 'Failed to add Redis service', detail: 'Railway may have deprecated this API. Create the database manually in the Railway dashboard.' });
      }
    } else {
      emit({ step: 'railway-redis', status: 'skipped', message: 'No cache requested' });
    }

    // Step 4: Add custom domain if hostname provided
    if (ctx.hostname && projectId) {
      emit({ step: 'railway-domain', status: 'started', message: `Adding domain ${ctx.hostname} to Railway project` });
      try {
        const res = await gql(token, `
          mutation($projectId: String!, $domain: String!) {
            customDomainCreate(input: { projectId: $projectId, domain: $domain }) {
              id
              domain
              status { dnsRecords { type hostlabel value } }
            }
          }
        `, { projectId, domain: ctx.hostname });

        if (res.status !== 200) throw new Error(`Railway API returned ${res.status}`);

        const data = safeJsonParse(res.body) as {
          data?: { customDomainCreate?: { id?: string; domain?: string } };
          errors?: { message: string }[];
        };

        if (data?.errors && data.errors.length > 0) {
          throw new Error(data.errors[0].message);
        }

        const domain = data?.data?.customDomainCreate?.domain ?? ctx.hostname;
        outputs['RAILWAY_DOMAIN'] = domain;
        emit({ step: 'railway-domain', status: 'done', message: `Domain "${domain}" added to Railway project` });
      } catch (err) {
        emit({ step: 'railway-domain', status: 'error', message: 'Failed to add domain to Railway', detail: (err as Error).message });
        // Non-fatal
      }
    }

    // Step 5: Create service with GitHub source (ADR-015)
    const ghOwner = ctx.credentials['_github-owner'];
    const ghRepo = ctx.credentials['_github-repo-name'];
    let serviceId = '';
    let environmentId = '';

    if (projectId && ghOwner && ghRepo) {
      emit({ step: 'railway-service', status: 'started', message: `Creating service linked to ${ghOwner}/${ghRepo}` });
      try {
        // First get the default environment ID
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
          const envEdges = envData?.data?.project?.environments?.edges ?? [];
          const prodEnv = envEdges.find(e => e.node.name === 'production') || envEdges[0];
          environmentId = prodEnv?.node.id ?? '';
        }

        // Create service with GitHub repo source
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
          } else {
            serviceId = svcData?.data?.serviceCreate?.id ?? '';
            emit({ step: 'railway-service', status: 'done', message: `Service created — linked to GitHub repo` });
          }
        }
      } catch (err) {
        emit({ step: 'railway-service', status: 'error', message: 'Failed to create service', detail: (err as Error).message });
        // Non-fatal — project exists, user can link manually
      }
    }

    // Step 6: Set environment variables on the service
    if (serviceId && environmentId) {
      emit({ step: 'railway-envvars', status: 'started', message: 'Setting environment variables' });
      try {
        // Railway uses ${{Plugin.VAR}} syntax for database references
        const variables: Record<string, string> = {};
        if (ctx.database === 'postgres' || ctx.database === 'mysql') {
          variables['DATABASE_URL'] = ctx.database === 'postgres'
            ? '${{Postgres.DATABASE_URL}}'
            : '${{MySQL.MYSQL_URL}}';
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

    // Step 7: Poll for deployment
    if (serviceId && environmentId) {
      emit({ step: 'railway-deploy', status: 'started', message: 'Waiting for Railway deployment...' });
      try {
        const start = Date.now();
        let deployUrl = '';
        while (Date.now() - start < DEPLOY_POLL_TIMEOUT_MS) {
          await new Promise(r => setTimeout(r, DEPLOY_POLL_INTERVAL_MS));
          if (ctx.abortSignal?.aborted) break;

          const depRes = await gql(token, `
            query($projectId: String!) {
              project(id: $projectId) {
                services { edges { node {
                  serviceInstances { edges { node {
                    domains { serviceDomains { domain } }
                    latestDeployment { status }
                  } } }
                } } }
              }
            }
          `, { projectId });

          if (depRes.status === 200) {
            const depData = safeJsonParse(depRes.body) as {
              data?: { project?: { services?: { edges: { node: { serviceInstances?: { edges: { node: { domains?: { serviceDomains?: { domain: string }[] }; latestDeployment?: { status: string } } }[] } } }[] } } };
            } | null;
            const svcNode = depData?.data?.project?.services?.edges?.[0]?.node;
            const instance = svcNode?.serviceInstances?.edges?.[0]?.node;
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
          outputs['RAILWAY_DOMAIN'] = deployUrl.replace('https://', '');
          emit({ step: 'railway-deploy', status: 'done', message: `Live at ${deployUrl}` });
        } else if (!ctx.abortSignal?.aborted) {
          emit({ step: 'railway-deploy', status: 'error', message: 'Deployment polling timed out — check Railway dashboard' });
        }
      } catch (err) {
        emit({ step: 'railway-deploy', status: 'error', message: 'Failed to poll deployment', detail: (err as Error).message });
      }
    } else if (!ghOwner || !ghRepo) {
      emit({ step: 'railway-deploy', status: 'skipped', message: 'No GitHub repo linked — deploy manually with: railway link && railway up' });
    }

    // Step 8: Generate railway.toml
    emit({ step: 'railway-config', status: 'started', message: 'Generating railway.toml' });
    try {
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

    // Step 9: Write .env
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

    return { success: true, resources, outputs, files };
  },

  async cleanup(resources: CreatedResource[], credentials: Record<string, string>): Promise<void> {
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
  },
};
