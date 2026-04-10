/**
 * Provisioning API — post-provision finalization steps.
 * Sentry, env-validator, health monitoring, deploy logging.
 * Split from provision.ts for file size (v23.3).
 */

import type { ProvisionEvent, CreatedResource } from '../lib/provisioners/types.js';
import { generateEnvValidator } from '../lib/env-validator.js';
import { logDeploy } from '../lib/deploy-log.js';
import { setupHealthMonitoring } from '../lib/health-monitor.js';
import { generateSentryInit } from '../lib/sentry-generator.js';
import { stripSecrets } from './provision-validate.js';

export interface PostProvisionOpts {
  projectDir: string;
  framework: string;
  deployTarget: string;
  projectName: string;
  hostname: string;
  region: string;
  runId: string;
  outputs: Record<string, string>;
  resources: CreatedResource[];
  sentryDsn: string | undefined;
  emit: (event: ProvisionEvent) => void;
}

/** Run post-provision finalization: sentry, env-validator, health monitoring, deploy logging. */
export async function runPostProvisionSteps(opts: PostProvisionOpts): Promise<void> {
  const { projectDir, framework, deployTarget, projectName, hostname, region, runId, outputs, resources, sentryDsn, emit } = opts;

  // ── Sentry integration (ADR-024) ──────────────────────────────
  await generateSentryInit(projectDir, framework, sentryDsn, emit);

  // ── Environment validation script (ADR-018) ──────────────────
  const envResult = await generateEnvValidator(projectDir, framework);
  if (envResult.file) {
    const hint = envResult.file.endsWith('.py')
      ? 'Add "python validate_env.py &&" before your start command'
      : 'Add "node validate-env.js &&" before your start command in package.json';
    emit({ step: 'env-validator', status: 'done', message: `Generated ${envResult.file} — ${hint}` });
  } else {
    emit({ step: 'env-validator', status: 'skipped', message: 'No .env file found — env validation script skipped' });
  }

  // ── Health monitoring (ADR-023) ──────────────────────────────
  const deployUrl = outputs['DEPLOY_URL'] || '';
  await setupHealthMonitoring(deployTarget, projectDir, projectName, deployUrl, outputs, emit);

  // ── Deploy logging (ADR-021) ─────────────────────────────────
  try {
    const logOutputs = stripSecrets(outputs);
    const logPath = await logDeploy({
      runId, timestamp: new Date().toISOString(), target: deployTarget,
      projectName, framework, deployUrl: outputs['DEPLOY_URL'] || '', hostname, region,
      resources: resources.map(r => ({ type: r.type, id: r.id })),
      outputs: logOutputs,
    });
    emit({ step: 'deploy-log', status: 'done', message: `Deploy logged to ${logPath}` });
  } catch {
    // Non-fatal — deploy succeeded even if logging fails
  }
}
