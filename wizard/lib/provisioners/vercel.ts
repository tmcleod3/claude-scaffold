/**
 * Vercel provisioner — creates a real Vercel project via API + generates vercel.json.
 * v3.8.0: Links GitHub repo, sets env vars, polls deploy (ADR-015).
 */

import { writeFile, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Provisioner, ProvisionContext, ProvisionEmitter, ProvisionResult, CreatedResource } from './types.js';
import { httpsPost, httpsGet, httpsDelete, safeJsonParse, slugify } from './http-client.js';
import { recordResourcePending, recordResourceCreated } from '../provision-manifest.js';
import { appendEnvSection } from '../env-writer.js';

const DEPLOY_POLL_INTERVAL_MS = 5000;
const DEPLOY_POLL_TIMEOUT_MS = 300_000; // 5 minutes

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
        // Project already exists — fetch its ID for subsequent steps
        try {
          const existingRes = await httpsGet('api.vercel.com', `/v10/projects/${slug}`, headers);
          if (existingRes.status === 200) {
            const existingData = safeJsonParse(existingRes.body) as { id?: string; name?: string } | null;
            projectId = existingData?.id ?? '';
            if (projectId) {
              resources.push({ type: 'vercel-project', id: projectId, region: 'global' });
              await recordResourceCreated(ctx.runId, 'vercel-project', projectId, 'global');
              outputs['VERCEL_PROJECT_ID'] = projectId;
            }
          }
        } catch { /* fetch failed, proceed without ID */ }
        outputs['VERCEL_PROJECT_NAME'] = slug;
        emit({ step: 'vercel-project', status: 'done', message: `Project "${slug}" already exists on Vercel — will use existing`, detail: projectId ? `ID: ${projectId}` : 'Could not fetch project ID' });
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

    // Step 4: Link GitHub repo (ADR-015 — auto-deploy on push)
    const ghOwner = ctx.credentials['_github-owner'];
    const ghRepo = ctx.credentials['_github-repo-name'];
    if (projectId && ghOwner && ghRepo) {
      emit({ step: 'vercel-link', status: 'started', message: `Linking GitHub repo ${ghOwner}/${ghRepo} to Vercel` });
      try {
        const linkBody = JSON.stringify({
          type: 'github',
          repo: `${ghOwner}/${ghRepo}`,
          sourceless: false,
          productionBranch: 'main',
        });
        const linkRes = await httpsPost(
          'api.vercel.com',
          `/v10/projects/${projectId}/link`,
          headers,
          linkBody,
        );
        if (linkRes.status === 200 || linkRes.status === 201) {
          emit({ step: 'vercel-link', status: 'done', message: `GitHub repo linked — auto-deploy enabled on push to main` });
        } else {
          const errBody = safeJsonParse(linkRes.body) as { error?: { message?: string } } | null;
          emit({ step: 'vercel-link', status: 'error', message: 'Failed to link GitHub repo', detail: errBody?.error?.message || `API returned ${linkRes.status}` });
        }
      } catch (err) {
        emit({ step: 'vercel-link', status: 'error', message: 'Failed to link GitHub repo', detail: (err as Error).message });
        // Non-fatal — user can link manually
      }
    }

    // Step 5: Set environment variables
    if (projectId) {
      emit({ step: 'vercel-envvars', status: 'started', message: 'Setting environment variables' });
      try {
        // Collect env vars from .env file (skip comments, empty lines, and VoidForge metadata)
        let envContent = '';
        try { envContent = await readFile(join(ctx.projectDir, '.env'), 'utf-8'); } catch { /* no .env */ }
        const envVars = envContent
          .split('\n')
          .filter(line => line.includes('=') && !line.startsWith('#'))
          .map(line => {
            const idx = line.indexOf('=');
            return { key: line.slice(0, idx).trim(), value: line.slice(idx + 1).trim().replace(/^["']|["']$/g, '') };
          })
          .filter(v => v.key && !v.key.startsWith('VERCEL_')); // Don't set Vercel metadata as env vars

        if (envVars.length > 0) {
          const envBody = JSON.stringify(envVars.map(v => ({
            key: v.key,
            value: v.value,
            type: 'encrypted',
            target: ['production', 'preview', 'development'],
          })));
          const envRes = await httpsPost(
            'api.vercel.com',
            `/v10/projects/${projectId}/env`,
            headers,
            envBody,
          );
          if (envRes.status === 200 || envRes.status === 201) {
            emit({ step: 'vercel-envvars', status: 'done', message: `Set ${envVars.length} environment variables` });
          } else {
            emit({ step: 'vercel-envvars', status: 'error', message: 'Failed to set env vars', detail: `API returned ${envRes.status}` });
          }
        } else {
          emit({ step: 'vercel-envvars', status: 'done', message: 'No environment variables to set' });
        }
      } catch (err) {
        emit({ step: 'vercel-envvars', status: 'error', message: 'Failed to set env vars', detail: (err as Error).message });
      }
    }

    // Step 6: Poll for deployment (triggered by GitHub push, ADR-015)
    if (projectId && ghOwner && ghRepo) {
      emit({ step: 'vercel-deploy', status: 'started', message: 'Waiting for deployment (triggered by git push)...' });
      try {
        const start = Date.now();
        let deployUrl = '';
        while (Date.now() - start < DEPLOY_POLL_TIMEOUT_MS) {
          await new Promise(r => setTimeout(r, DEPLOY_POLL_INTERVAL_MS));
          if (ctx.abortSignal?.aborted) break;

          const depRes = await httpsGet(
            'api.vercel.com',
            `/v6/deployments?projectId=${projectId}&limit=1`,
            headers,
          );
          if (depRes.status !== 200) continue;

          const depData = safeJsonParse(depRes.body) as {
            deployments?: { state?: string; url?: string; readyState?: string }[];
          } | null;
          const latest = depData?.deployments?.[0];
          if (!latest) continue;

          if (latest.readyState === 'READY' || latest.state === 'READY') {
            deployUrl = latest.url ? `https://${latest.url}` : '';
            break;
          }
          if (latest.readyState === 'ERROR' || latest.state === 'ERROR') {
            emit({ step: 'vercel-deploy', status: 'error', message: 'Deployment failed on Vercel', detail: 'Check the Vercel dashboard for build logs' });
            break;
          }

          const elapsed = Math.round((Date.now() - start) / 1000);
          if (elapsed % 15 === 0) {
            emit({ step: 'vercel-deploy', status: 'started', message: `Deployment status: ${latest.readyState || latest.state || 'building'}... (${elapsed}s)` });
          }
        }

        if (deployUrl) {
          outputs['DEPLOY_URL'] = deployUrl;
          emit({ step: 'vercel-deploy', status: 'done', message: `Live at ${deployUrl}` });
        } else if (!ctx.abortSignal?.aborted) {
          emit({ step: 'vercel-deploy', status: 'error', message: 'Deployment polling timed out — check Vercel dashboard', detail: 'The deployment may still be building' });
        }
      } catch (err) {
        emit({ step: 'vercel-deploy', status: 'error', message: 'Failed to poll deployment', detail: (err as Error).message });
      }
    } else if (!ghOwner || !ghRepo) {
      emit({ step: 'vercel-deploy', status: 'skipped', message: 'No GitHub repo linked — deploy manually with: npx vercel deploy' });
    }

    // Step 7: Write .env
    emit({ step: 'vercel-env', status: 'started', message: 'Writing Vercel config to .env' });
    try {
      const envLines = [
        `# VoidForge Vercel — generated ${new Date().toISOString()}`,
        `VERCEL_PROJECT_NAME=${outputs['VERCEL_PROJECT_NAME'] || slug}`,
      ];
      if (outputs['VERCEL_PROJECT_ID']) {
        envLines.push(`VERCEL_PROJECT_ID=${outputs['VERCEL_PROJECT_ID']}`);
      }
      if (outputs['DEPLOY_URL']) {
        envLines.push(`DEPLOY_URL=${outputs['DEPLOY_URL']}`);
      }
      envLines.push('# Auto-deploys on push to main');
      await appendEnvSection(ctx.projectDir, envLines);
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
