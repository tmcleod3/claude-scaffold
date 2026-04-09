/**
 * Cloudflare provisioner — creates a real Workers/Pages project via API + generates wrangler.toml.
 * v3.8.0: Includes GitHub source at creation time for auto-deploy (ADR-011, ADR-015).
 */

import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Provisioner, ProvisionContext, ProvisionEmitter, ProvisionResult, CreatedResource } from './types.js';
import { httpsPost, httpsGet, httpsDelete, safeJsonParse, slugify } from './http-client.js';
import { recordResourcePending, recordResourceCreated } from '../provision-manifest.js';
import { appendEnvSection } from '../env-writer.js';

const DEPLOY_POLL_INTERVAL_MS = 5000;
const DEPLOY_POLL_TIMEOUT_MS = 300_000;

export const cloudflareProvisioner: Provisioner = {
  async validate(ctx: ProvisionContext): Promise<string[]> {
    const errors: string[] = [];
    if (!ctx.projectDir) errors.push('Project directory is required');
    if (!ctx.credentials['cloudflare-api-token']) errors.push('Cloudflare API token is required');
    return errors;
  },

  async provision(ctx: ProvisionContext, emit: ProvisionEmitter): Promise<ProvisionResult> {
    const files: string[] = [];
    const resources: CreatedResource[] = [];
    const outputs: Record<string, string> = {};
    const token = ctx.credentials['cloudflare-api-token'];
    const slug = slugify(ctx.projectName);
    const headers = {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    };

    // Step 1: Get account ID
    emit({ step: 'cf-account', status: 'started', message: 'Fetching Cloudflare account' });
    let accountId = '';
    try {
      const res = await httpsGet('api.cloudflare.com', '/client/v4/accounts?page=1&per_page=1', {
        'Authorization': `Bearer ${token}`,
      });

      if (res.status !== 200) {
        throw new Error(`Cloudflare API returned ${res.status}`);
      }

      const data = safeJsonParse(res.body) as {
        success?: boolean;
        result?: { id: string; name: string }[];
      } | null;

      if (!data?.success || !data?.result || data.result.length === 0) {
        throw new Error('No Cloudflare account found for this token');
      }

      accountId = data.result[0].id;
      outputs['CF_ACCOUNT_ID'] = accountId;
      emit({ step: 'cf-account', status: 'done', message: `Account: ${data.result[0].name}` });
    } catch (err) {
      emit({ step: 'cf-account', status: 'error', message: 'Failed to fetch Cloudflare account', detail: (err as Error).message });
      return { success: false, resources, outputs, files, error: (err as Error).message };
    }

    // GitHub source info (used in project creation and deploy polling)
    const ghOwner = ctx.credentials['_github-owner'];
    const ghRepo = ctx.credentials['_github-repo-name'];

    // Step 2: Create Pages project
    emit({ step: 'cf-project', status: 'started', message: 'Creating Cloudflare Pages project' });
    try {
      await recordResourcePending(ctx.runId, 'cf-pages-project', slug, 'global');
      const projectPayload: Record<string, unknown> = {
        name: slug,
        production_branch: 'main',
      };
      if (ghOwner && ghRepo) {
        projectPayload.source = {
          type: 'github',
          config: {
            owner: ghOwner,
            repo_name: ghRepo,
            production_branch: 'main',
            pr_comments_enabled: true,
            deployments_enabled: true,
          },
        };
        projectPayload.build_config = {
          build_command: ctx.framework === 'django' ? '' : 'npm run build',
          destination_dir: ctx.framework === 'next.js' ? 'out' : 'dist',
        };
      }
      const body = JSON.stringify(projectPayload);

      const res = await httpsPost(
        'api.cloudflare.com',
        `/client/v4/accounts/${accountId}/pages/projects`,
        headers,
        body,
      );

      if (res.status === 200 || res.status === 201) {
        const data = safeJsonParse(res.body) as {
          success?: boolean;
          result?: { name?: string; subdomain?: string };
        } | null;

        const projectName = data?.result?.name ?? slug;
        const subdomain = data?.result?.subdomain ?? `${slug}.pages.dev`;

        resources.push({ type: 'cf-pages-project', id: projectName, region: 'global' });
        await recordResourceCreated(ctx.runId, 'cf-pages-project', projectName, 'global');
        outputs['CF_PROJECT_NAME'] = projectName;
        outputs['CF_PROJECT_URL'] = `https://${subdomain}`;
        emit({ step: 'cf-project', status: 'done', message: `Pages project "${projectName}" created — ${subdomain}` });
      } else if (res.status === 409) {
        // Project exists — track it so cleanup knows about it
        resources.push({ type: 'cf-pages-project', id: slug, region: 'global' });
        await recordResourceCreated(ctx.runId, 'cf-pages-project', slug, 'global');
        emit({ step: 'cf-project', status: 'done', message: `Project "${slug}" already exists on Cloudflare — will use existing` });
        outputs['CF_PROJECT_NAME'] = slug;
        outputs['CF_PROJECT_URL'] = `https://${slug}.pages.dev`;
      } else {
        const data = safeJsonParse(res.body) as { errors?: { message: string }[] } | null;
        const errMsg = data?.errors?.[0]?.message || `Cloudflare API returned ${res.status}`;
        throw new Error(errMsg);
      }
    } catch (err) {
      emit({ step: 'cf-project', status: 'error', message: 'Failed to create Pages project', detail: (err as Error).message });
      return { success: false, resources, outputs, files, error: (err as Error).message };
    }

    // Step 3: Add custom domain if hostname provided
    const projectName = outputs['CF_PROJECT_NAME'] || slug;
    if (ctx.hostname && accountId) {
      emit({ step: 'cf-domain', status: 'started', message: `Adding domain ${ctx.hostname} to Pages project` });
      try {
        const domainBody = JSON.stringify({ name: ctx.hostname });
        const domainRes = await httpsPost(
          'api.cloudflare.com',
          `/client/v4/accounts/${accountId}/pages/projects/${projectName}/domains`,
          headers,
          domainBody,
        );

        if (domainRes.status === 200 || domainRes.status === 201) {
          outputs['CF_CUSTOM_DOMAIN'] = ctx.hostname;
          emit({ step: 'cf-domain', status: 'done', message: `Domain "${ctx.hostname}" added to Pages project` });
        } else if (domainRes.status === 409) {
          emit({ step: 'cf-domain', status: 'done', message: `Domain "${ctx.hostname}" already configured on Pages project` });
          outputs['CF_CUSTOM_DOMAIN'] = ctx.hostname;
        } else {
          const errData = safeJsonParse(domainRes.body) as { errors?: { message: string }[] } | null;
          throw new Error(errData?.errors?.[0]?.message || `Pages domains API returned ${domainRes.status}`);
        }
      } catch (err) {
        emit({ step: 'cf-domain', status: 'error', message: 'Failed to add domain to Pages project', detail: (err as Error).message });
        // Non-fatal
      }
    }

    // Step 4: Create D1 database if requested
    if (ctx.database === 'sqlite') {
      emit({ step: 'cf-d1', status: 'started', message: 'Creating D1 database' });
      try {
        await recordResourcePending(ctx.runId, 'cf-d1-database', `${slug}-db`, 'global');

        const body = JSON.stringify({ name: `${slug}-db` });
        const res = await httpsPost(
          'api.cloudflare.com',
          `/client/v4/accounts/${accountId}/d1/database`,
          headers,
          body,
        );

        if (res.status === 200 || res.status === 201) {
          const data = safeJsonParse(res.body) as {
            result?: { uuid?: string; name?: string };
          } | null;
          const dbId = data?.result?.uuid ?? '';
          if (dbId) {
            resources.push({ type: 'cf-d1-database', id: dbId, region: 'global' });
            await recordResourceCreated(ctx.runId, 'cf-d1-database', dbId, 'global');
            outputs['CF_D1_DATABASE_ID'] = dbId;
            outputs['CF_D1_DATABASE_NAME'] = `${slug}-db`;
          }
          emit({ step: 'cf-d1', status: 'done', message: `D1 database "${slug}-db" created` });
        } else {
          const data = safeJsonParse(res.body) as { errors?: { message: string }[] } | null;
          throw new Error(data?.errors?.[0]?.message || `D1 creation returned ${res.status}`);
        }
      } catch (err) {
        emit({ step: 'cf-d1', status: 'error', message: 'Failed to create D1 database', detail: (err as Error).message });
        // Non-fatal
      }
    } else {
      emit({ step: 'cf-d1', status: 'skipped', message: 'No database requested' });
    }

    // Step 5: Generate wrangler.toml
    emit({ step: 'cf-config', status: 'started', message: 'Generating wrangler.toml' });
    try {
      let config = `# wrangler.toml — Cloudflare Workers/Pages configuration
# Generated by VoidForge
# Deploy with: npx wrangler pages deploy ./dist

name = "${slug}"
compatibility_date = "${new Date().toISOString().slice(0, 10)}"
pages_build_output_dir = "./dist"

[vars]
ENVIRONMENT = "production"
`;

      if (outputs['CF_D1_DATABASE_ID']) {
        config += `
[[d1_databases]]
binding = "DB"
database_name = "${slug}-db"
database_id = "${outputs['CF_D1_DATABASE_ID']}"
`;
      }

      await writeFile(join(ctx.projectDir, 'wrangler.toml'), config, 'utf-8');
      files.push('wrangler.toml');
      emit({ step: 'cf-config', status: 'done', message: 'Generated wrangler.toml' });
    } catch (err) {
      emit({ step: 'cf-config', status: 'error', message: 'Failed to write wrangler.toml', detail: (err as Error).message });
    }

    // Step 6: Poll for deployment (if GitHub-linked, deploy triggered by push)
    if (ghOwner && ghRepo && accountId) {
      emit({ step: 'cf-deploy', status: 'started', message: 'Waiting for Cloudflare Pages deployment...' });
      try {
        const start = Date.now();
        let deployUrl = '';
        while (Date.now() - start < DEPLOY_POLL_TIMEOUT_MS) {
          await new Promise(r => setTimeout(r, DEPLOY_POLL_INTERVAL_MS));
          if (ctx.abortSignal?.aborted) break;

          const depRes = await httpsGet(
            'api.cloudflare.com',
            `/client/v4/accounts/${accountId}/pages/projects/${projectName}/deployments?sort_by=created_on&sort_order=desc&per_page=1`,
            { 'Authorization': `Bearer ${token}` },
          );
          if (depRes.status !== 200) continue;

          const depData = safeJsonParse(depRes.body) as {
            result?: { url?: string; latest_stage?: { name?: string; status?: string } }[];
          } | null;
          const latest = depData?.result?.[0];
          if (!latest) continue;

          const stage = latest.latest_stage;
          if (stage?.name === 'deploy' && stage?.status === 'success') {
            deployUrl = latest.url ? `https://${latest.url}` : outputs['CF_PROJECT_URL'] || '';
            break;
          }
          if (stage?.status === 'failure') {
            emit({ step: 'cf-deploy', status: 'error', message: 'Cloudflare Pages deployment failed', detail: 'Check the Cloudflare dashboard for build logs' });
            break;
          }

          const elapsed = Math.round((Date.now() - start) / 1000);
          if (elapsed % 15 === 0) {
            emit({ step: 'cf-deploy', status: 'started', message: `Deploy status: ${stage?.name || 'queued'} / ${stage?.status || 'waiting'}... (${elapsed}s)` });
          }
        }

        if (deployUrl) {
          outputs['DEPLOY_URL'] = deployUrl;
          emit({ step: 'cf-deploy', status: 'done', message: `Live at ${deployUrl}` });
        } else if (!ctx.abortSignal?.aborted) {
          emit({ step: 'cf-deploy', status: 'error', message: 'Deployment polling timed out — check Cloudflare dashboard' });
        }
      } catch (err) {
        emit({ step: 'cf-deploy', status: 'error', message: 'Failed to poll deployment', detail: (err as Error).message });
      }
    } else if (!ghOwner || !ghRepo) {
      emit({ step: 'cf-deploy', status: 'skipped', message: 'No GitHub repo linked — deploy manually with: npx wrangler pages deploy ./dist' });
    }

    // Step 7: Write .env
    emit({ step: 'cf-env', status: 'started', message: 'Writing Cloudflare config to .env' });
    try {
      const envLines = [
        `# VoidForge Cloudflare — generated ${new Date().toISOString()}`,
        `CF_ACCOUNT_ID=${accountId}`,
        `CF_PROJECT_NAME=${outputs['CF_PROJECT_NAME'] || slug}`,
      ];
      if (outputs['CF_PROJECT_URL']) envLines.push(`CF_PROJECT_URL=${outputs['CF_PROJECT_URL']}`);
      if (outputs['CF_D1_DATABASE_ID']) envLines.push(`CF_D1_DATABASE_ID=${outputs['CF_D1_DATABASE_ID']}`);
      if (outputs['DEPLOY_URL']) envLines.push(`DEPLOY_URL=${outputs['DEPLOY_URL']}`);
      envLines.push(ghOwner ? '# Auto-deploys on push to main' : '# Deploy with: npx wrangler pages deploy ./dist');
      await appendEnvSection(ctx.projectDir, envLines);
      emit({ step: 'cf-env', status: 'done', message: 'Cloudflare config written to .env' });
    } catch (err) {
      emit({ step: 'cf-env', status: 'error', message: 'Failed to write .env', detail: (err as Error).message });
    }

    return { success: true, resources, outputs, files };
  },

  async cleanup(resources: CreatedResource[], credentials: Record<string, string>): Promise<void> {
    const token = credentials['cloudflare-api-token'];
    if (!token) return;

    // Need account ID for API calls — fetch it
    let accountId = '';
    try {
      const res = await httpsGet('api.cloudflare.com', '/client/v4/accounts?page=1&per_page=1', {
        'Authorization': `Bearer ${token}`,
      });
      const data = safeJsonParse(res.body) as { result?: { id: string }[] } | null;
      accountId = data?.result?.[0]?.id ?? '';
    } catch { return; }

    if (!accountId) return;

    for (const resource of [...resources].reverse()) {
      try {
        switch (resource.type) {
          case 'cf-d1-database': {
            await httpsDelete(
              'api.cloudflare.com',
              `/client/v4/accounts/${accountId}/d1/database/${resource.id}`,
              { 'Authorization': `Bearer ${token}` },
            );
            break;
          }
          case 'cf-pages-project': {
            await httpsDelete(
              'api.cloudflare.com',
              `/client/v4/accounts/${accountId}/pages/projects/${resource.id}`,
              { 'Authorization': `Bearer ${token}` },
            );
            break;
          }
        }
      } catch (err) {
        console.error(`Failed to cleanup ${resource.type} ${resource.id}:`, (err as Error).message);
      }
    }
  },
};
