/**
 * Vercel provisioner — creates a real Vercel project via API + generates vercel.json.
 */

import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Provisioner, ProvisionContext, ProvisionEmitter, ProvisionResult, CreatedResource } from './types.js';
import { httpsPost, httpsGet, httpsDelete, safeJsonParse, slugify } from './http-client.js';
import { recordResourcePending, recordResourceCreated } from '../provision-manifest.js';

export const vercelProvisioner: Provisioner = {
  async validate(ctx: ProvisionContext): Promise<string[]> {
    const errors: string[] = [];
    if (!ctx.projectDir) errors.push('Project directory is required');
    if (!ctx.credentials['vercel-token']) errors.push('Vercel API token is required');
    return errors;
  },

  async provision(ctx: ProvisionContext, emit: ProvisionEmitter): Promise<ProvisionResult> {
    const files: string[] = [];
    const resources: CreatedResource[] = [];
    const outputs: Record<string, string> = {};
    const token = ctx.credentials['vercel-token'];
    const slug = slugify(ctx.projectName);
    const framework = ctx.framework || 'next.js';
    const headers = {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    };

    // Step 1: Create Vercel project
    emit({ step: 'vercel-project', status: 'started', message: 'Creating Vercel project' });
    let projectId = '';
    try {
      await recordResourcePending(ctx.runId, 'vercel-project', slug, 'global');

      // Only pass framework if it's a Vercel-recognized value — otherwise omit and let Vercel auto-detect
      const vercelFrameworks: Record<string, string> = {
        'next.js': 'nextjs',
        'nuxt': 'nuxtjs',
        'svelte': 'sveltekit',
        'remix': 'remix',
        'gatsby': 'gatsby',
        'astro': 'astro',
        'vite': 'vite',
      };

      const projectBody: Record<string, string> = { name: slug };
      const vercelFw = vercelFrameworks[framework];
      if (vercelFw) projectBody.framework = vercelFw;

      const body = JSON.stringify(projectBody);

      const res = await httpsPost('api.vercel.com', '/v10/projects', headers, body);

      if (res.status === 200 || res.status === 201) {
        const data = safeJsonParse(res.body) as { id?: string; name?: string } | null;
        projectId = data?.id ?? '';
        if (!projectId) throw new Error('Vercel returned no project ID');
        resources.push({ type: 'vercel-project', id: projectId, region: 'global' });
        await recordResourceCreated(ctx.runId, 'vercel-project', projectId, 'global');
        outputs['VERCEL_PROJECT_ID'] = projectId;
        outputs['VERCEL_PROJECT_NAME'] = data?.name ?? slug;
        emit({ step: 'vercel-project', status: 'done', message: `Project "${data?.name}" created on Vercel` });
      } else if (res.status === 409) {
        // Project already exists — use it
        emit({ step: 'vercel-project', status: 'done', message: `Project "${slug}" already exists on Vercel — will use existing`, detail: 'No new project created' });
        outputs['VERCEL_PROJECT_NAME'] = slug;
      } else {
        const errBody = safeJsonParse(res.body) as { error?: { message?: string } } | null;
        throw new Error(errBody?.error?.message || `Vercel API returned ${res.status}`);
      }
    } catch (err) {
      emit({ step: 'vercel-project', status: 'error', message: 'Failed to create Vercel project', detail: (err as Error).message });
      return { success: false, resources, outputs, files, error: (err as Error).message };
    }

    // Step 2: Add custom domain if hostname provided
    if (ctx.hostname && projectId) {
      emit({ step: 'vercel-domain', status: 'started', message: `Adding domain ${ctx.hostname} to Vercel project` });
      try {
        const domainBody = JSON.stringify({ name: ctx.hostname });
        const domainRes = await httpsPost(
          'api.vercel.com',
          `/v10/projects/${projectId}/domains`,
          headers,
          domainBody,
        );

        if (domainRes.status === 200 || domainRes.status === 201) {
          outputs['VERCEL_DOMAIN'] = ctx.hostname;
          emit({ step: 'vercel-domain', status: 'done', message: `Domain "${ctx.hostname}" added to Vercel project` });
        } else if (domainRes.status === 409) {
          emit({ step: 'vercel-domain', status: 'done', message: `Domain "${ctx.hostname}" already configured on Vercel` });
          outputs['VERCEL_DOMAIN'] = ctx.hostname;
        } else {
          const errBody = safeJsonParse(domainRes.body) as { error?: { message?: string } } | null;
          throw new Error(errBody?.error?.message || `Vercel domains API returned ${domainRes.status}`);
        }
      } catch (err) {
        emit({ step: 'vercel-domain', status: 'error', message: 'Failed to add domain to Vercel', detail: (err as Error).message });
        // Non-fatal — DNS wiring will still work, user can add domain manually
      }
    } else if (ctx.hostname && !projectId) {
      emit({ step: 'vercel-domain', status: 'skipped', message: 'Cannot add domain — no project ID (existing project)' });
    }

    // Step 3: Generate vercel.json
    emit({ step: 'vercel-config', status: 'started', message: 'Generating vercel.json' });
    try {
      const config: Record<string, unknown> = {
        $schema: 'https://openapi.vercel.sh/vercel.json',
      };

      if (framework === 'express') {
        config.builds = [{ src: 'dist/index.js', use: '@vercel/node' }];
        config.routes = [{ src: '/(.*)', dest: 'dist/index.js' }];
      }

      await writeFile(
        join(ctx.projectDir, 'vercel.json'),
        JSON.stringify(config, null, 2) + '\n',
        'utf-8',
      );
      files.push('vercel.json');
      emit({ step: 'vercel-config', status: 'done', message: 'Generated vercel.json' });
    } catch (err) {
      emit({ step: 'vercel-config', status: 'error', message: 'Failed to write vercel.json', detail: (err as Error).message });
      // Non-fatal — project was still created
    }

    // Step 4: Write .env
    emit({ step: 'vercel-env', status: 'started', message: 'Writing Vercel config to .env' });
    try {
      const envLines = [
        `# VoidForge Vercel — generated ${new Date().toISOString()}`,
        `VERCEL_PROJECT_NAME=${outputs['VERCEL_PROJECT_NAME'] || slug}`,
      ];
      if (outputs['VERCEL_PROJECT_ID']) {
        envLines.push(`VERCEL_PROJECT_ID=${outputs['VERCEL_PROJECT_ID']}`);
      }
      envLines.push('# Deploy with: npx vercel deploy');

      const envPath = join(ctx.projectDir, '.env');
      const { readFile } = await import('node:fs/promises');
      let existing = '';
      try { existing = await readFile(envPath, 'utf-8'); } catch { /* new file */ }
      const separator = existing ? '\n\n' : '';
      await writeFile(envPath, existing + separator + envLines.join('\n') + '\n', 'utf-8');
      emit({ step: 'vercel-env', status: 'done', message: 'Vercel config written to .env' });
    } catch (err) {
      emit({ step: 'vercel-env', status: 'error', message: 'Failed to write .env', detail: (err as Error).message });
    }

    return { success: true, resources, outputs, files };
  },

  async cleanup(resources: CreatedResource[], credentials: Record<string, string>): Promise<void> {
    const token = credentials['vercel-token'];
    if (!token) return;

    for (const resource of resources) {
      if (resource.type === 'vercel-project') {
        try {
          await httpsDelete('api.vercel.com', `/v9/projects/${resource.id}`, {
            'Authorization': `Bearer ${token}`,
          });
        } catch (err) {
          console.error(`Failed to delete Vercel project ${resource.id}:`, (err as Error).message);
        }
      }
    }
  },
};
