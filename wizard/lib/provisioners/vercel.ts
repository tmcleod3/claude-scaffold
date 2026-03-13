/**
 * Vercel provisioner — generates vercel.json config. No API calls.
 */

import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Provisioner, ProvisionContext, ProvisionEmitter, ProvisionResult, CreatedResource } from './types.js';

export const vercelProvisioner: Provisioner = {
  async validate(ctx: ProvisionContext): Promise<string[]> {
    const errors: string[] = [];
    if (!ctx.projectDir) errors.push('Project directory is required');
    return errors;
  },

  async provision(ctx: ProvisionContext, emit: ProvisionEmitter): Promise<ProvisionResult> {
    const files: string[] = [];
    const framework = ctx.framework || 'next.js';

    emit({ step: 'vercel-config', status: 'started', message: 'Generating vercel.json' });
    try {
      const config: Record<string, unknown> = {
        $schema: 'https://openapi.vercel.sh/vercel.json',
      };

      if (framework === 'express') {
        config.builds = [{ src: 'dist/index.js', use: '@vercel/node' }];
        config.routes = [{ src: '/(.*)', dest: 'dist/index.js' }];
      }

      // Next.js needs no special vercel.json — it's auto-detected

      await writeFile(
        join(ctx.projectDir, 'vercel.json'),
        JSON.stringify(config, null, 2) + '\n',
        'utf-8',
      );
      files.push('vercel.json');
      emit({
        step: 'vercel-config', status: 'done',
        message: 'Generated vercel.json — deploy with `vercel deploy` when your app is built',
      });
    } catch (err) {
      emit({ step: 'vercel-config', status: 'error', message: 'Failed to write vercel.json', detail: (err as Error).message });
      return { success: false, resources: [], outputs: {}, files, error: (err as Error).message };
    }

    return { success: true, resources: [], outputs: {}, files };
  },

  async cleanup(_resources: CreatedResource[], _credentials: Record<string, string>): Promise<void> {
    // Config-only — nothing to clean up
  },
};
