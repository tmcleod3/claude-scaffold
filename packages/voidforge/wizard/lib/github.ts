/**
 * GitHub integration — create repo, git init + remote + push.
 * Runs as a pre-provision step (ADR-011) so platforms can link to the repo.
 * Uses exec.ts for git operations (ADR-013). No npm dependencies.
 */

import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { writeFile, readFile } from 'node:fs/promises';
import { execCommand, validateBinaries } from './exec.js';
import { httpsPost, httpsGet, safeJsonParse, slugify } from './provisioners/http-client.js';
import type { ProvisionEmitter } from './provisioners/types.js';
import { recordResourcePending, recordResourceCreated } from './provision-manifest.js';
import { generateCIWorkflows } from './ci-generator.js';

const GH_API = 'api.github.com';
const GH_API_VERSION = '2022-11-28';

function ghHeaders(token: string): Record<string, string> {
  return {
    'Authorization': `Bearer ${token}`,
    'User-Agent': 'VoidForge',
    'X-GitHub-Api-Version': GH_API_VERSION,
    'Content-Type': 'application/json',
    'Accept': 'application/vnd.github+json',
  };
}

export interface GitHubResult {
  success: boolean;
  repoUrl?: string;
  owner?: string;
  repoName?: string;
  error?: string;
}

/**
 * Full GitHub pre-provision flow:
 * 1. Validate git binary exists
 * 2. Determine owner (from vault or token)
 * 3. Create repo via API (or use existing)
 * 4. Ensure .gitignore has .ssh/ and .env
 * 5. git init + remote + push
 */
export async function prepareGithub(
  runId: string,
  token: string,
  owner: string | null,
  projectName: string,
  projectDir: string,
  emit: ProvisionEmitter,
  abortSignal?: AbortSignal,
  framework?: string,
  deployTarget?: string,
): Promise<GitHubResult> {
  const repoName = slugify(projectName);
  const headers = ghHeaders(token);

  // Step 1: Validate git binary
  emit({ step: 'github-validate', status: 'started', message: 'Checking for git binary' });
  const missing = await validateBinaries(['git']);
  if (missing.length > 0) {
    emit({ step: 'github-validate', status: 'error', message: 'git is not installed. Install git to enable GitHub integration.' });
    return { success: false, error: 'git binary not found' };
  }
  emit({ step: 'github-validate', status: 'done', message: 'git found' });

  // Step 2: Determine owner
  emit({ step: 'github-owner', status: 'started', message: 'Determining GitHub owner' });
  let resolvedOwner = owner;
  const ownerIsExplicit = !!owner;
  if (!resolvedOwner) {
    try {
      const res = await httpsGet(GH_API, '/user', headers);
      if (res.status !== 200) {
        emit({ step: 'github-owner', status: 'error', message: 'Failed to fetch GitHub user', detail: `API returned ${res.status}` });
        return { success: false, error: `GitHub API returned ${res.status}` };
      }
      const data = safeJsonParse(res.body) as { login?: string } | null;
      resolvedOwner = data?.login ?? '';
      if (!resolvedOwner) {
        emit({ step: 'github-owner', status: 'error', message: 'Could not determine GitHub username from token' });
        return { success: false, error: 'No GitHub username in token response' };
      }
    } catch (err) {
      emit({ step: 'github-owner', status: 'error', message: 'GitHub API connection failed', detail: (err as Error).message });
      return { success: false, error: (err as Error).message };
    }
  }
  // Validate owner format (Kenobi: prevent path traversal in API calls)
  if (!/^[a-zA-Z0-9_.-]+$/.test(resolvedOwner)) {
    emit({ step: 'github-owner', status: 'error', message: `Invalid GitHub owner format: "${resolvedOwner}"` });
    return { success: false, error: 'Invalid GitHub owner format' };
  }

  emit({ step: 'github-owner', status: 'done', message: `GitHub owner: ${resolvedOwner}` });

  // Step 3: Create repo (or detect existing)
  emit({ step: 'github-repo', status: 'started', message: `Creating repository ${resolvedOwner}/${repoName}` });
  try {
    await recordResourcePending(runId, 'github-repo', `${resolvedOwner}/${repoName}`, 'global');

    // Check if repo already exists
    const checkRes = await httpsGet(GH_API, `/repos/${resolvedOwner}/${repoName}`, headers);
    if (checkRes.status === 200) {
      emit({ step: 'github-repo', status: 'done', message: `Repository ${resolvedOwner}/${repoName} already exists — will push to it` });
      await recordResourceCreated(runId, 'github-repo', `${resolvedOwner}/${repoName}`, 'global');
    } else {
      // Create new repo — use org endpoint if owner was explicitly set (may be an org)
      const body = JSON.stringify({
        name: repoName,
        private: true,
        auto_init: false,
        description: `Created by VoidForge`,
      });

      const createPath = ownerIsExplicit
        ? `/orgs/${resolvedOwner}/repos`
        : '/user/repos';
      let createRes = await httpsPost(GH_API, createPath, headers, body);
      // If org endpoint returned 404, the owner is a user, not an org — fall back
      if (createRes.status === 404 && ownerIsExplicit) {
        createRes = await httpsPost(GH_API, '/user/repos', headers, body);
      }
      if (createRes.status === 201) {
        await recordResourceCreated(runId, 'github-repo', `${resolvedOwner}/${repoName}`, 'global');
        emit({ step: 'github-repo', status: 'done', message: `Repository ${resolvedOwner}/${repoName} created (private)` });
      } else if (createRes.status === 422) {
        // Repo already exists (race condition or name conflict)
        const errData = safeJsonParse(createRes.body) as { message?: string; errors?: { message: string }[] } | null;
        const detail = errData?.errors?.[0]?.message || errData?.message || 'Repository name already exists';
        emit({ step: 'github-repo', status: 'done', message: `Repository exists — ${detail}` });
        await recordResourceCreated(runId, 'github-repo', `${resolvedOwner}/${repoName}`, 'global');
      } else {
        const errData = safeJsonParse(createRes.body) as { message?: string } | null;
        throw new Error(errData?.message || `GitHub API returned ${createRes.status}`);
      }
    }
  } catch (err) {
    emit({ step: 'github-repo', status: 'error', message: 'Failed to create GitHub repository', detail: (err as Error).message });
    return { success: false, error: (err as Error).message };
  }

  // Step 4: Ensure .gitignore protects secrets
  emit({ step: 'github-gitignore', status: 'started', message: 'Checking .gitignore' });
  try {
    const gitignorePath = join(projectDir, '.gitignore');
    let gitignore = '';
    try { gitignore = await readFile(gitignorePath, 'utf-8'); } catch { /* new file */ }

    const requiredEntries = ['.env', '.env.*', '.ssh/', 'node_modules/'];
    const existingLines = gitignore.split('\n').map(l => l.trim());
    const missing = requiredEntries.filter(entry => !existingLines.includes(entry));
    if (missing.length > 0) {
      const addition = (gitignore ? '\n' : '') + '# VoidForge — protect secrets\n' + missing.join('\n') + '\n';
      await writeFile(gitignorePath, gitignore + addition, 'utf-8');
      emit({ step: 'github-gitignore', status: 'done', message: `Added ${missing.length} entries to .gitignore` });
    } else {
      emit({ step: 'github-gitignore', status: 'done', message: '.gitignore already has required entries' });
    }
  } catch (err) {
    emit({ step: 'github-gitignore', status: 'error', message: 'Failed to update .gitignore', detail: (err as Error).message });
    // Non-fatal
  }

  // Step 5: git init + remote + add + commit + push
  emit({ step: 'github-push', status: 'started', message: 'Pushing code to GitHub' });
  try {
    const gitOpts = { cwd: projectDir, timeout: 30_000, abortSignal };
    const repoUrl = `https://github.com/${resolvedOwner}/${repoName}.git`;

    // Init if needed
    if (!existsSync(join(projectDir, '.git'))) {
      await execCommand('git', ['init'], gitOpts);
      await execCommand('git', ['branch', '-M', 'main'], gitOpts);
    }

    // Set remote (idempotent)
    try {
      await execCommand('git', ['remote', 'add', 'origin', repoUrl], gitOpts);
    } catch {
      // Remote exists — update URL
      await execCommand('git', ['remote', 'set-url', 'origin', repoUrl], gitOpts);
    }

    // Verify .gitignore protects secrets before staging (defense in depth)
    try {
      const currentGitignore = await readFile(join(projectDir, '.gitignore'), 'utf-8');
      const lines = currentGitignore.split('\n').map(l => l.trim());
      if (!lines.includes('.env') || !lines.includes('.ssh/')) {
        emit({ step: 'github-push', status: 'error', message: 'Cannot push — .gitignore is missing .env or .ssh/ entries' });
        return { success: false, error: '.gitignore missing required entries' };
      }
    } catch {
      emit({ step: 'github-push', status: 'error', message: 'Cannot push — .gitignore not found' });
      return { success: false, error: '.gitignore not found' };
    }

    // Stage all files
    await execCommand('git', ['add', '-A'], gitOpts);

    // Commit (may fail if nothing to commit — that's fine)
    try {
      await execCommand('git', ['commit', '-m', 'Initial commit — VoidForge'], {
        ...gitOpts,
        env: {
          GIT_AUTHOR_NAME: 'VoidForge',
          GIT_AUTHOR_EMAIL: 'voidforge@localhost',
          GIT_COMMITTER_NAME: 'VoidForge',
          GIT_COMMITTER_EMAIL: 'voidforge@localhost',
        },
      });
    } catch {
      // Nothing to commit — existing repo with no changes
    }

    // Push using http.extraheader to avoid token in URL/reflog (Kenobi: git reflog token persistence)
    await execCommand('git', ['push', '-u', 'origin', 'main'], {
      ...gitOpts,
      timeout: 120_000, // Longer timeout for push
      env: {
        GIT_TERMINAL_PROMPT: '0',
        GIT_CONFIG_COUNT: '1',
        GIT_CONFIG_KEY_0: 'http.https://github.com/.extraheader',
        GIT_CONFIG_VALUE_0: `Authorization: Basic ${Buffer.from(`x-access-token:${token}`).toString('base64')}`,
      },
    });

    emit({ step: 'github-push', status: 'done', message: `Code pushed to ${resolvedOwner}/${repoName}` });

    // ── CI/CD workflow generation (ADR-017) ────────────────────────
    if (framework && deployTarget) {
      emit({ step: 'github-ci', status: 'started', message: 'Generating GitHub Actions CI/CD workflows' });
      try {
        const ciResult = await generateCIWorkflows(projectDir, framework, deployTarget);
        if (ciResult.success && ciResult.files.length > 0) {
          // Commit and push the workflow files
          await execCommand('git', ['add', ...ciResult.files], gitOpts);
          try {
            await execCommand('git', ['commit', '-m', 'Add CI/CD workflows — VoidForge (ADR-017)'], {
              ...gitOpts,
              env: {
                GIT_AUTHOR_NAME: 'VoidForge',
                GIT_AUTHOR_EMAIL: 'voidforge@localhost',
                GIT_COMMITTER_NAME: 'VoidForge',
                GIT_COMMITTER_EMAIL: 'voidforge@localhost',
              },
            });
            await execCommand('git', ['push', 'origin', 'main'], {
              ...gitOpts,
              timeout: 120_000,
              env: {
                GIT_TERMINAL_PROMPT: '0',
                GIT_CONFIG_COUNT: '1',
                GIT_CONFIG_KEY_0: 'http.https://github.com/.extraheader',
                GIT_CONFIG_VALUE_0: `Authorization: Basic ${Buffer.from(`x-access-token:${token}`).toString('base64')}`,
              },
            });
            emit({ step: 'github-ci', status: 'done', message: `Generated ${ciResult.files.join(', ')} — CI/CD enabled` });
          } catch {
            emit({ step: 'github-ci', status: 'done', message: 'Workflows generated locally (push separately if needed)' });
          }
        }
      } catch (ciErr) {
        emit({ step: 'github-ci', status: 'error', message: 'Failed to generate CI/CD workflows', detail: (ciErr as Error).message });
        // Non-fatal — project was still pushed
      }
    }

    return {
      success: true,
      repoUrl: `https://github.com/${resolvedOwner}/${repoName}`,
      owner: resolvedOwner,
      repoName,
    };
  } catch (err) {
    // Sanitize error — strip token from git error messages
    const rawError = (err as Error).message;
    const safeError = rawError
      .replace(/x-access-token:[^@]+@/g, 'x-access-token:***@')
      .replace(/Authorization: Basic [A-Za-z0-9+/=]+/g, 'Authorization: Basic ***')
      .replace(/GIT_CONFIG_VALUE_0=[^\s]+/g, 'GIT_CONFIG_VALUE_0=***');
    emit({ step: 'github-push', status: 'error', message: 'Failed to push to GitHub', detail: safeError });
    return { success: false, error: safeError };
  }
}
