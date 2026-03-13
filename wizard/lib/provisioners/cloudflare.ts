/**
 * Cloudflare provisioner — creates a real Workers/Pages project via API + generates wrangler.toml.
 */

import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Provisioner, ProvisionContext, ProvisionEmitter, ProvisionResult, CreatedResource } from './types.js';
import { httpsPost, httpsGet, httpsDelete } from './http-client.js';
import { recordResourcePending, recordResourceCreated } from '../provision-manifest.js';

function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').slice(0, 40);
}

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

      const data = JSON.parse(res.body) as {
        success?: boolean;
        result?: { id: string; name: string }[];
      };

      if (!data.success || !data.result || data.result.length === 0) {
        throw new Error('No Cloudflare account found for this token');
      }

      accountId = data.result[0].id;
      outputs['CF_ACCOUNT_ID'] = accountId;
      emit({ step: 'cf-account', status: 'done', message: `Account: ${data.result[0].name}` });
    } catch (err) {
      emit({ step: 'cf-account', status: 'error', message: 'Failed to fetch Cloudflare account', detail: (err as Error).message });
      return { success: false, resources, outputs, files, error: (err as Error).message };
    }

    // Step 2: Create Pages project
    emit({ step: 'cf-project', status: 'started', message: 'Creating Cloudflare Pages project' });
    try {
      await recordResourcePending(ctx.runId, 'cf-pages-project', slug, 'global');

      const body = JSON.stringify({
        name: slug,
        production_branch: 'main',
      });

      const res = await httpsPost(
        'api.cloudflare.com',
        `/client/v4/accounts/${accountId}/pages/projects`,
        headers,
        body,
      );

      if (res.status === 200 || res.status === 201) {
        const data = JSON.parse(res.body) as {
          success?: boolean;
          result?: { name?: string; subdomain?: string };
        };

        const projectName = data.result?.name ?? slug;
        const subdomain = data.result?.subdomain ?? `${slug}.pages.dev`;

        resources.push({ type: 'cf-pages-project', id: projectName, region: 'global' });
        await recordResourceCreated(ctx.runId, 'cf-pages-project', projectName, 'global');
        outputs['CF_PROJECT_NAME'] = projectName;
        outputs['CF_PROJECT_URL'] = `https://${subdomain}`;
        emit({ step: 'cf-project', status: 'done', message: `Pages project "${projectName}" created — ${subdomain}` });
      } else if (res.status === 409) {
        emit({ step: 'cf-project', status: 'done', message: `Project "${slug}" already exists on Cloudflare — will use existing` });
        outputs['CF_PROJECT_NAME'] = slug;
      } else {
        const data = JSON.parse(res.body) as { errors?: { message: string }[] };
        const errMsg = data.errors?.[0]?.message || `Cloudflare API returned ${res.status}`;
        throw new Error(errMsg);
      }
    } catch (err) {
      emit({ step: 'cf-project', status: 'error', message: 'Failed to create Pages project', detail: (err as Error).message });
      return { success: false, resources, outputs, files, error: (err as Error).message };
    }

    // Step 3: Create D1 database if requested
    if (ctx.database === 'sqlite' || ctx.database === 'postgres') {
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
          const data = JSON.parse(res.body) as {
            result?: { uuid?: string; name?: string };
          };
          const dbId = data.result?.uuid ?? '';
          if (dbId) {
            resources.push({ type: 'cf-d1-database', id: dbId, region: 'global' });
            await recordResourceCreated(ctx.runId, 'cf-d1-database', dbId, 'global');
            outputs['CF_D1_DATABASE_ID'] = dbId;
            outputs['CF_D1_DATABASE_NAME'] = `${slug}-db`;
          }
          emit({ step: 'cf-d1', status: 'done', message: `D1 database "${slug}-db" created` });
        } else {
          const data = JSON.parse(res.body) as { errors?: { message: string }[] };
          throw new Error(data.errors?.[0]?.message || `D1 creation returned ${res.status}`);
        }
      } catch (err) {
        emit({ step: 'cf-d1', status: 'error', message: 'Failed to create D1 database', detail: (err as Error).message });
        // Non-fatal
      }
    } else {
      emit({ step: 'cf-d1', status: 'skipped', message: 'No database requested' });
    }

    // Step 4: Generate wrangler.toml
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

    // Step 5: Write .env
    emit({ step: 'cf-env', status: 'started', message: 'Writing Cloudflare config to .env' });
    try {
      const envLines = [
        `# VoidForge Cloudflare — generated ${new Date().toISOString()}`,
        `CF_ACCOUNT_ID=${accountId}`,
        `CF_PROJECT_NAME=${outputs['CF_PROJECT_NAME'] || slug}`,
      ];
      if (outputs['CF_PROJECT_URL']) envLines.push(`CF_PROJECT_URL=${outputs['CF_PROJECT_URL']}`);
      if (outputs['CF_D1_DATABASE_ID']) envLines.push(`CF_D1_DATABASE_ID=${outputs['CF_D1_DATABASE_ID']}`);
      envLines.push('# Deploy with: npx wrangler pages deploy ./dist');

      const envPath = join(ctx.projectDir, '.env');
      const { readFile } = await import('node:fs/promises');
      let existing = '';
      try { existing = await readFile(envPath, 'utf-8'); } catch { /* new file */ }
      const separator = existing ? '\n\n' : '';
      await writeFile(envPath, existing + separator + envLines.join('\n') + '\n', 'utf-8');
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
      const data = JSON.parse(res.body) as { result?: { id: string }[] };
      accountId = data.result?.[0]?.id ?? '';
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
