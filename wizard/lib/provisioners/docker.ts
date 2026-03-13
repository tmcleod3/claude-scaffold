/**
 * Docker provisioner — generates Dockerfile + docker-compose.yml locally.
 * No cloud API calls. Files only.
 */

import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Provisioner, ProvisionContext, ProvisionEmitter, ProvisionResult, CreatedResource } from './types.js';
import { generateDockerfile, generateDockerignore } from './scripts/dockerfile.js';
import { generateDockerCompose } from './scripts/docker-compose.js';

export const dockerProvisioner: Provisioner = {
  async validate(ctx: ProvisionContext): Promise<string[]> {
    const errors: string[] = [];
    if (!ctx.projectDir) errors.push('Project directory is required');
    if (!ctx.projectName) errors.push('Project name is required');
    return errors;
  },

  async provision(ctx: ProvisionContext, emit: ProvisionEmitter): Promise<ProvisionResult> {
    const files: string[] = [];
    const framework = ctx.framework || 'express';

    // Step 1: Generate Dockerfile
    emit({ step: 'dockerfile', status: 'started', message: 'Generating Dockerfile' });
    try {
      const dockerfile = generateDockerfile(framework);
      const dockerfilePath = join(ctx.projectDir, 'Dockerfile');
      await writeFile(dockerfilePath, dockerfile, 'utf-8');
      files.push('Dockerfile');
      emit({ step: 'dockerfile', status: 'done', message: `Dockerfile generated (${framework})` });
    } catch (err) {
      emit({ step: 'dockerfile', status: 'error', message: 'Failed to write Dockerfile', detail: (err as Error).message });
      return { success: false, resources: [], outputs: {}, files, error: (err as Error).message };
    }

    // Step 2: Generate docker-compose.yml
    emit({ step: 'docker-compose', status: 'started', message: 'Generating docker-compose.yml' });
    try {
      const compose = generateDockerCompose({
        projectName: ctx.projectName,
        framework,
        database: ctx.database || 'none',
        cache: ctx.cache || 'none',
      });
      const composePath = join(ctx.projectDir, 'docker-compose.yml');
      await writeFile(composePath, compose, 'utf-8');
      files.push('docker-compose.yml');
      emit({ step: 'docker-compose', status: 'done', message: 'docker-compose.yml generated' });
    } catch (err) {
      emit({ step: 'docker-compose', status: 'error', message: 'Failed to write docker-compose.yml', detail: (err as Error).message });
      return { success: false, resources: [], outputs: {}, files, error: (err as Error).message };
    }

    // Step 3: Generate .dockerignore
    emit({ step: 'dockerignore', status: 'started', message: 'Generating .dockerignore' });
    try {
      const ignore = generateDockerignore();
      const ignorePath = join(ctx.projectDir, '.dockerignore');
      await writeFile(ignorePath, ignore, 'utf-8');
      files.push('.dockerignore');
      emit({ step: 'dockerignore', status: 'done', message: '.dockerignore generated' });
    } catch (err) {
      emit({ step: 'dockerignore', status: 'error', message: 'Failed to write .dockerignore', detail: (err as Error).message });
      return { success: false, resources: [], outputs: {}, files, error: (err as Error).message };
    }

    return {
      success: true,
      resources: [],
      outputs: {},
      files,
    };
  },

  async cleanup(_resources: CreatedResource[], _credentials: Record<string, string>): Promise<void> {
    // Docker provisioner creates local files only — nothing to clean up
  },
};
