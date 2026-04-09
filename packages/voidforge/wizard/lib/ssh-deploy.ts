/**
 * SSH deploy — connect to EC2, run provision.sh, deploy code via release directories.
 * Uses exec.ts for child process operations (ADR-013).
 * Performs release-directory management directly via SSH (not deploy.sh which is local-mode).
 * Retry loop handles sshd startup delay after EC2 launch.
 */

import { join } from 'node:path';
import { execCommand, validateBinaries } from './exec.js';
import type { ProvisionEmitter } from './provisioners/types.js';

const SSH_RETRY_COUNT = 5;
const SSH_RETRY_DELAY_MS = 10_000;
const SSH_COMMAND_TIMEOUT_MS = 300_000; // 5 minutes per command
const HEALTH_CHECK_RETRIES = 5;
const HEALTH_CHECK_DELAY_MS = 5_000;

function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}

function sshArgs(keyPath: string, host: string, user: string): string[] {
  return [
    '-i', keyPath,
    '-o', 'StrictHostKeyChecking=accept-new',
    '-o', 'ConnectTimeout=10',
    '-o', 'BatchMode=yes',
    `${user}@${host}`,
  ];
}

/**
 * Execute a single SSH command with retry for connection failures.
 * Returns stdout on success, throws on failure after all retries.
 */
async function sshExec(
  keyPath: string,
  host: string,
  user: string,
  command: string,
  emit: ProvisionEmitter,
  stepName: string,
  abortSignal?: AbortSignal,
): Promise<string> {
  for (let attempt = 1; attempt <= SSH_RETRY_COUNT; attempt++) {
    try {
      const result = await execCommand(
        'ssh',
        [...sshArgs(keyPath, host, user), command],
        { timeout: SSH_COMMAND_TIMEOUT_MS, abortSignal },
      );
      return result.stdout;
    } catch (err) {
      const msg = (err as Error).message;
      const isConnectionError =
        msg.includes('Connection refused') ||
        msg.includes('Connection timed out') ||
        msg.includes('No route to host') ||
        msg.includes('Connection reset');

      if (isConnectionError && attempt < SSH_RETRY_COUNT) {
        emit({
          step: stepName,
          status: 'started',
          message: `SSH connection failed (attempt ${attempt}/${SSH_RETRY_COUNT}), retrying in ${SSH_RETRY_DELAY_MS / 1000}s...`,
        });
        await sleep(SSH_RETRY_DELAY_MS);
        continue;
      }
      throw err;
    }
  }
  throw new Error('SSH retry loop exited unexpectedly');
}

export interface SshDeployResult {
  success: boolean;
  deployUrl?: string;
  error?: string;
}

/**
 * Full SSH deploy flow for AWS VPS:
 * 1. Validate ssh/rsync binaries
 * 2. Upload provision.sh via rsync
 * 3. Run provision.sh (first-time server setup)
 * 4. Create release directory, rsync code, install deps, swap symlink, restart
 * 5. Health check with rollback on failure
 *
 * NOTE: deploy.sh is a LOCAL-mode script (runs from dev machine, SSHes into server).
 * This module runs commands DIRECTLY on the server via SSH, matching the same
 * release-directory strategy but without the SSH-over-SSH problem.
 */
export async function sshDeploy(
  projectDir: string,
  host: string,
  user: string,
  keyPath: string,
  hostname: string | undefined,
  framework: string,
  emit: ProvisionEmitter,
  abortSignal?: AbortSignal,
): Promise<SshDeployResult> {
  // Step 1: Validate binaries
  emit({ step: 'ssh-validate', status: 'started', message: 'Checking for ssh and rsync' });
  const missingBins = await validateBinaries(['ssh', 'rsync']);
  if (missingBins.length > 0) {
    emit({ step: 'ssh-validate', status: 'error', message: `Missing binaries: ${missingBins.join(', ')}. Install them to enable SSH deploy.` });
    return { success: false, error: `Missing: ${missingBins.join(', ')}` };
  }
  emit({ step: 'ssh-validate', status: 'done', message: 'ssh and rsync found' });

  const fullKeyPath = keyPath.startsWith('/') ? keyPath : join(projectDir, keyPath);
  const rsyncSshFlag = `ssh -i "${fullKeyPath}" -o StrictHostKeyChecking=accept-new -o ConnectTimeout=10`;

  // Step 2: Upload infrastructure scripts
  emit({ step: 'ssh-upload', status: 'started', message: 'Uploading infrastructure scripts' });
  try {
    await sshExec(fullKeyPath, host, user, 'mkdir -p ~/infra', emit, 'ssh-upload', abortSignal);
    await execCommand('rsync', [
      '-avz', '--progress',
      '-e', rsyncSshFlag,
      `${join(projectDir, 'infra')}/`,
      `${user}@${host}:~/infra/`,
    ], { timeout: 60_000, abortSignal });
    emit({ step: 'ssh-upload', status: 'done', message: 'Infrastructure scripts uploaded' });
  } catch (err) {
    emit({ step: 'ssh-upload', status: 'error', message: 'Failed to upload scripts', detail: (err as Error).message });
    return { success: false, error: (err as Error).message };
  }

  // Step 3: Run provision.sh (first-time server setup — idempotent, safe to re-run)
  emit({ step: 'ssh-provision', status: 'started', message: 'Running server provisioning (this may take 2-5 minutes)...' });
  try {
    const provStart = Date.now();
    const heartbeat = setInterval(() => {
      const elapsed = Math.round((Date.now() - provStart) / 1000);
      emit({ step: 'ssh-provision', status: 'started', message: `Still provisioning... (${elapsed}s elapsed)` });
    }, 30_000);
    try {
      await sshExec(fullKeyPath, host, user, 'chmod +x ~/infra/provision.sh && sudo ~/infra/provision.sh', emit, 'ssh-provision', abortSignal);
    } finally {
      clearInterval(heartbeat);
    }
    emit({ step: 'ssh-provision', status: 'done', message: 'Server provisioning complete' });
  } catch (err) {
    emit({ step: 'ssh-provision', status: 'error', message: 'Server provisioning failed', detail: (err as Error).message });
    return { success: false, error: `provision.sh failed: ${(err as Error).message}` };
  }

  // Step 4: Deploy code using release-directory strategy
  // Matches the deploy.sh pattern but executed server-side via SSH commands
  const release = new Date().toISOString().replace(/[-:T.Z]/g, '').slice(0, 14);
  const releasesDir = '/opt/app/releases';
  const currentLink = '/opt/app/current';
  const releaseDir = `${releasesDir}/${release}`;

  emit({ step: 'ssh-deploy', status: 'started', message: `Creating release ${release}` });
  let previousRelease = '';
  try {
    // Create release directory
    await sshExec(fullKeyPath, host, user, `sudo mkdir -p ${releaseDir} && sudo chown ${user}:${user} ${releaseDir}`, emit, 'ssh-deploy', abortSignal);

    // Rsync project code to release directory (excluding dev artifacts)
    await execCommand('rsync', [
      '-avz', '--delete',
      '--exclude', '.git',
      '--exclude', 'node_modules',
      '--exclude', '.env',
      '--exclude', '.ssh',
      '--exclude', 'infra',
      '--exclude', 'coverage',
      '--exclude', 'logs',
      '-e', rsyncSshFlag,
      `${projectDir}/`,
      `${user}@${host}:${releaseDir}/`,
    ], { timeout: 120_000, abortSignal });
    emit({ step: 'ssh-deploy', status: 'started', message: 'Code uploaded, installing dependencies...' });

    // Install dependencies
    const isNode = ['next.js', 'express'].includes(framework) || !framework;
    const isDjango = framework === 'django';
    const installCmd = isNode
      ? 'npm ci --omit=dev'
      : isDjango
        ? 'pip3.12 install -r requirements.txt'
        : 'bundle install --deployment --without development test';
    await sshExec(fullKeyPath, host, user, `cd ${releaseDir} && ${installCmd}`, emit, 'ssh-deploy', abortSignal);

    // Save previous release for rollback
    try {
      previousRelease = (await sshExec(fullKeyPath, host, user, `readlink ${currentLink} 2>/dev/null || echo ''`, emit, 'ssh-deploy', abortSignal)).trim();
    } catch { /* no previous release */ }

    // Swap symlink atomically
    await sshExec(fullKeyPath, host, user, `sudo ln -sfn ${releaseDir} ${currentLink}`, emit, 'ssh-deploy', abortSignal);

    // Restart application
    emit({ step: 'ssh-deploy', status: 'started', message: 'Restarting application...' });
    const restartCmd = isNode
      ? `cd ${currentLink} && pm2 startOrRestart ${currentLink}/ecosystem.config.js --env production && pm2 save`
      : isDjango
        ? `cd ${currentLink} && python3.12 manage.py migrate --noinput && python3.12 manage.py collectstatic --noinput && supervisorctl restart app`
        : `cd ${currentLink} && RAILS_ENV=production bundle exec rails db:migrate && touch tmp/restart.txt`;
    await sshExec(fullKeyPath, host, user, restartCmd, emit, 'ssh-deploy', abortSignal);

    emit({ step: 'ssh-deploy', status: 'done', message: 'Application deployed and restarted' });
  } catch (err) {
    // Rollback: restore previous symlink if available
    if (previousRelease) {
      emit({ step: 'ssh-rollback', status: 'started', message: 'Deployment failed — rolling back to previous release' });
      try {
        await sshExec(fullKeyPath, host, user, `sudo ln -sfn ${previousRelease} ${currentLink}`, emit, 'ssh-rollback', abortSignal);
        const isNode = ['next.js', 'express'].includes(framework) || !framework;
        if (isNode) {
          await sshExec(fullKeyPath, host, user, `cd ${currentLink} && pm2 startOrRestart ${currentLink}/ecosystem.config.js --env production`, emit, 'ssh-rollback', abortSignal);
        }
        emit({ step: 'ssh-rollback', status: 'done', message: `Rolled back to ${previousRelease}` });
      } catch {
        emit({ step: 'ssh-rollback', status: 'error', message: 'Rollback also failed — check server manually' });
      }
    }
    emit({ step: 'ssh-deploy', status: 'error', message: 'Deployment failed', detail: (err as Error).message });
    return { success: false, error: (err as Error).message };
  }

  // Step 5: Health check
  const deployUrl = hostname ? `https://${hostname}` : `http://${host}`;
  emit({ step: 'ssh-health', status: 'started', message: `Checking health at ${deployUrl}` });
  let healthy = false;
  for (let i = 1; i <= HEALTH_CHECK_RETRIES; i++) {
    try {
      await sshExec(fullKeyPath, host, user, 'curl -sf http://localhost:3000/ -o /dev/null', emit, 'ssh-health', abortSignal);
      healthy = true;
      emit({ step: 'ssh-health', status: 'done', message: `Health check passed — live at ${deployUrl}` });
      break;
    } catch {
      if (i < HEALTH_CHECK_RETRIES) {
        emit({ step: 'ssh-health', status: 'started', message: `Health check attempt ${i}/${HEALTH_CHECK_RETRIES} failed, retrying...` });
        await sleep(HEALTH_CHECK_DELAY_MS);
      }
    }
  }

  if (!healthy) {
    // Rollback on failed health check
    if (previousRelease) {
      emit({ step: 'ssh-rollback', status: 'started', message: 'Health check failed — rolling back' });
      try {
        await sshExec(fullKeyPath, host, user, `sudo ln -sfn ${previousRelease} ${currentLink}`, emit, 'ssh-rollback', abortSignal);
        emit({ step: 'ssh-rollback', status: 'done', message: `Rolled back to ${previousRelease}` });
      } catch {
        emit({ step: 'ssh-rollback', status: 'error', message: 'Rollback failed — check server manually' });
      }
    }
    emit({ step: 'ssh-health', status: 'error', message: `Health check failed after ${HEALTH_CHECK_RETRIES} attempts`, detail: `Check: ssh -i ${keyPath} ${user}@${host}` });
    return { success: false, deployUrl, error: 'Health check failed' };
  }

  // Clean up old releases (keep last 5)
  try {
    await sshExec(fullKeyPath, host, user, `cd ${releasesDir} && ls -1d */ 2>/dev/null | head -n -5 | xargs -r rm -rf`, emit, 'ssh-cleanup', abortSignal);
  } catch { /* non-fatal */ }

  return { success: true, deployUrl };
}
