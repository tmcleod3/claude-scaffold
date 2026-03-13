/**
 * Railway provisioner — creates a real Railway project via GraphQL API + generates railway.toml.
 */

import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Provisioner, ProvisionContext, ProvisionEmitter, ProvisionResult, CreatedResource } from './types.js';
import { httpsPost } from './http-client.js';
import { recordResourcePending, recordResourceCreated } from '../provision-manifest.js';

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

      const data = JSON.parse(res.body) as {
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
      emit({ step: 'railway-db', status: 'started', message: `Adding ${dbType} plugin to Railway project` });
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

        const data = JSON.parse(res.body) as {
          data?: { pluginCreate?: { id?: string } };
          errors?: { message: string }[];
        };

        if (data.errors && data.errors.length > 0) {
          throw new Error(data.errors[0].message);
        }

        const pluginId = data.data?.pluginCreate?.id ?? '';
        if (pluginId) {
          resources.push({ type: 'railway-plugin', id: pluginId, region: 'global' });
          await recordResourceCreated(ctx.runId, 'railway-plugin', pluginId, 'global');
        }
        outputs['RAILWAY_DB_PLUGIN'] = dbType;
        emit({ step: 'railway-db', status: 'done', message: `${dbType} plugin added — connection string available in Railway dashboard` });
      } catch (err) {
        emit({ step: 'railway-db', status: 'error', message: `Failed to add ${dbType} plugin`, detail: (err as Error).message });
        // Non-fatal
      }
    } else {
      emit({ step: 'railway-db', status: 'skipped', message: 'No database requested' });
    }

    // Step 3: Add Redis plugin if cache requested
    if (ctx.cache === 'redis') {
      emit({ step: 'railway-redis', status: 'started', message: 'Adding Redis plugin to Railway project' });
      try {
        await recordResourcePending(ctx.runId, 'railway-plugin', `${projectId}-redis`, 'global');

        const res = await gql(token, `
          mutation($projectId: String!, $plugin: String!) {
            pluginCreate(input: { projectId: $projectId, plugin: $plugin }) {
              id
            }
          }
        `, { projectId, plugin: 'redis' });

        const data = JSON.parse(res.body) as {
          data?: { pluginCreate?: { id?: string } };
          errors?: { message: string }[];
        };

        if (data.errors && data.errors.length > 0) {
          throw new Error(data.errors[0].message);
        }

        const pluginId = data.data?.pluginCreate?.id ?? '';
        if (pluginId) {
          resources.push({ type: 'railway-plugin', id: pluginId, region: 'global' });
          await recordResourceCreated(ctx.runId, 'railway-plugin', pluginId, 'global');
        }
        emit({ step: 'railway-redis', status: 'done', message: 'Redis plugin added' });
      } catch (err) {
        emit({ step: 'railway-redis', status: 'error', message: 'Failed to add Redis plugin', detail: (err as Error).message });
      }
    } else {
      emit({ step: 'railway-redis', status: 'skipped', message: 'No cache requested' });
    }

    // Step 4: Generate railway.toml
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

    // Step 5: Write .env
    emit({ step: 'railway-env', status: 'started', message: 'Writing Railway config to .env' });
    try {
      const envLines = [
        `# VoidForge Railway — generated ${new Date().toISOString()}`,
        `RAILWAY_PROJECT_ID=${projectId}`,
        `RAILWAY_PROJECT_NAME=${outputs['RAILWAY_PROJECT_NAME'] || ctx.projectName}`,
        `# Deploy with: railway link ${projectId} && railway up`,
      ];

      const envPath = join(ctx.projectDir, '.env');
      const { readFile } = await import('node:fs/promises');
      let existing = '';
      try { existing = await readFile(envPath, 'utf-8'); } catch { /* new file */ }
      const separator = existing ? '\n\n' : '';
      await writeFile(envPath, existing + separator + envLines.join('\n') + '\n', 'utf-8');
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
