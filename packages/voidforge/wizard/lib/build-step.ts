/**
 * Pre-deploy build step — framework-aware build before upload/push.
 * Runs AFTER provisioning, BEFORE deploy actions (SSH/S3/platform).
 * Uses exec.ts for process execution (ADR-013, ADR-016).
 */

import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { execCommand } from './exec.js';
import type { ProvisionEmitter } from './provisioners/types.js';

interface BuildConfig {
  command: string;
  args: string[];
  outputDir: string;
}

/** Framework → build configuration mapping. */
const FRAMEWORK_BUILDS: Record<string, BuildConfig> = {
  'next.js':  { command: 'npm', args: ['run', 'build'], outputDir: '.next' },
  'express':  { command: 'npm', args: ['run', 'build'], outputDir: 'dist' },
  'vite':     { command: 'npm', args: ['run', 'build'], outputDir: 'dist' },
  'nuxt':     { command: 'npm', args: ['run', 'build'], outputDir: '.output' },
  'remix':    { command: 'npm', args: ['run', 'build'], outputDir: 'build' },
  'svelte':   { command: 'npm', args: ['run', 'build'], outputDir: 'build' },
  'sveltekit':{ command: 'npm', args: ['run', 'build'], outputDir: 'build' },
  'astro':    { command: 'npm', args: ['run', 'build'], outputDir: 'dist' },
  'gatsby':   { command: 'npm', args: ['run', 'build'], outputDir: 'public' },
  'django':   { command: 'python', args: ['manage.py', 'collectstatic', '--noinput'], outputDir: 'staticfiles' },
  'rails':    { command: 'bundle', args: ['exec', 'rails', 'assets:precompile'], outputDir: 'public/assets' },
};

/** Default for unknown Node-based frameworks. */
const DEFAULT_BUILD: BuildConfig = { command: 'npm', args: ['run', 'build'], outputDir: 'dist' };

/** Frameworks where the build step should be skipped. */
const SKIP_BUILD_FRAMEWORKS = new Set(['flask']);

export interface BuildStepResult {
  success: boolean;
  outputDir: string;
  error?: string;
}

/**
 * Run a framework-aware build step in the project directory.
 * Returns success if the build output directory exists after the build.
 */
export async function runBuildStep(
  projectDir: string,
  framework: string,
  emit: ProvisionEmitter,
  abortSignal?: AbortSignal,
): Promise<BuildStepResult> {
  if (SKIP_BUILD_FRAMEWORKS.has(framework)) {
    emit({ step: 'build', status: 'skipped', message: `${framework} — no build step required` });
    return { success: true, outputDir: '' };
  }

  const config = FRAMEWORK_BUILDS[framework] || DEFAULT_BUILD;
  const fullOutputDir = join(projectDir, config.outputDir);

  // If output dir already exists, skip build (user may have built manually)
  if (existsSync(fullOutputDir)) {
    emit({ step: 'build', status: 'done', message: `Build output already exists at ${config.outputDir} — skipping build` });
    return { success: true, outputDir: config.outputDir };
  }

  emit({ step: 'build', status: 'started', message: `Building project: ${config.command} ${config.args.join(' ')}` });

  try {
    // Check if package.json exists for Node-based builds
    if (config.command === 'npm' && !existsSync(join(projectDir, 'package.json'))) {
      emit({ step: 'build', status: 'skipped', message: 'No package.json found — skipping build' });
      return { success: true, outputDir: '' };
    }

    // Install dependencies first for Node projects
    if (config.command === 'npm' && existsSync(join(projectDir, 'package.json'))) {
      emit({ step: 'build-deps', status: 'started', message: 'Installing dependencies (npm ci)' });
      try {
        await execCommand('npm', ['ci'], {
          cwd: projectDir,
          timeout: 300_000,
          abortSignal,
        });
        emit({ step: 'build-deps', status: 'done', message: 'Dependencies installed' });
      } catch (depErr) {
        // Fall back to npm install if npm ci fails (no lock file)
        await execCommand('npm', ['install'], {
          cwd: projectDir,
          timeout: 300_000,
          abortSignal,
        });
        emit({ step: 'build-deps', status: 'done', message: 'Dependencies installed (via npm install)' });
      }
    }

    await execCommand(config.command, config.args, {
      cwd: projectDir,
      timeout: 300_000, // 5 minutes for builds
      abortSignal,
    });

    // Verify output directory was created
    if (existsSync(fullOutputDir)) {
      emit({ step: 'build', status: 'done', message: `Build complete — output at ${config.outputDir}` });
      return { success: true, outputDir: config.outputDir };
    }

    // Output dir doesn't exist — check common alternatives
    const alternatives = ['dist', 'build', 'out', '.next', 'public'];
    for (const alt of alternatives) {
      if (existsSync(join(projectDir, alt))) {
        emit({ step: 'build', status: 'done', message: `Build complete — output found at ${alt} (expected ${config.outputDir})` });
        return { success: true, outputDir: alt };
      }
    }

    emit({ step: 'build', status: 'error', message: `Build command succeeded but output directory "${config.outputDir}" not found` });
    return { success: false, outputDir: config.outputDir, error: `Build output directory "${config.outputDir}" not found after build` };
  } catch (err) {
    const message = (err as Error).message;
    emit({ step: 'build', status: 'error', message: 'Build failed', detail: message });
    return { success: false, outputDir: config.outputDir, error: message };
  }
}

/**
 * Get the expected build output directory for a framework.
 * Used by deploy steps that need to know where to find build artifacts.
 */
export function getBuildOutputDir(framework: string): string {
  return (FRAMEWORK_BUILDS[framework] || DEFAULT_BUILD).outputDir;
}
