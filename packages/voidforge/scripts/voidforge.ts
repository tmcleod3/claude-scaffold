#!/usr/bin/env node
/**
 * VoidForge CLI — v21.0 The Extraction
 *
 * npx voidforge                       Launch wizard (browser UI at :3141)
 * npx voidforge init                  Create new project (Gandalf flow)
 * npx voidforge init --headless       Create project without browser
 * npx voidforge init --core           Minimal methodology (no Holocron, no patterns)
 * npx voidforge update                Update project methodology (Bombadil)
 * npx voidforge update --self         Update the wizard itself
 * npx voidforge update --extensions   Update all installed extensions
 * npx voidforge install <ext>         Add extension to current project
 * npx voidforge uninstall <ext>       Remove extension from current project
 * npx voidforge deploy                Deploy project (Haku)
 * npx voidforge doctor                Check versions, compatibility, health
 * npx voidforge migrate               Migrate v20.x project to v21.0
 * npx voidforge migrate treasury      Migrate global treasury to per-project (v22.1)
 * npx voidforge version               Show wizard + methodology versions
 * npx voidforge templates             List available project templates
 */

import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { execSync } from 'node:child_process';

const args = process.argv.slice(2);
const command = args[0];

// ── Version ──────────────────────────────────────────────

async function getPackageVersion(): Promise<string> {
  const dir = import.meta.dirname ?? new URL('.', import.meta.url).pathname;
  // Try ../package.json (dev: scripts/) then ../../package.json (dist: dist/scripts/)
  for (const rel of ['..', '../..']) {
    const pkgPath = resolve(dir, rel, 'package.json');
    try {
      const raw = await readFile(pkgPath, 'utf-8');
      const pkg = JSON.parse(raw) as { version?: string; name?: string };
      if ((pkg.name === 'thevoidforge' || pkg.name === 'voidforge') && pkg.version) return pkg.version;
    } catch {
      continue;
    }
  }
  return 'unknown';
}

// ── Commands ─────────────────────────────────────────────

async function cmdVersion(): Promise<void> {
  const ver = await getPackageVersion();
  const nodeVer = process.version;
  console.log(`VoidForge v${ver}`);
  console.log(`Methodology v${ver}`);
  console.log(`Node ${nodeVer}`);
}

async function cmdDoctor(): Promise<void> {
  const ver = await getPackageVersion();
  const nodeVer = process.version;
  const nodeMajor = parseInt(nodeVer.slice(1), 10);
  const { findProjectRoot, getGlobalDir, getVaultPath, readMarker } =
    await import('../wizard/lib/marker.js');
  const { readRegistry } = await import('../wizard/lib/project-registry.js');

  console.log('\nVoidForge Doctor\n');

  // Node.js check
  const nodeOk = nodeMajor >= 20 && nodeMajor < 25;
  console.log(`${nodeOk ? '✓' : '✗'} Node.js ${nodeVer} (required: >=20.11.0 <25.0.0)`);

  // Wizard install
  console.log(`✓ Wizard v${ver}`);

  // Global config
  const globalDir = getGlobalDir();
  const globalExists = existsSync(globalDir);
  console.log(`${globalExists ? '✓' : '✗'} Global config at ${globalDir}`);

  if (globalExists) {
    const vaultExists = existsSync(getVaultPath());
    console.log(`  - Vault: ${vaultExists ? '✓ (encrypted)' : '✗ not found'}`);

    const projects = await readRegistry();
    console.log(`  - Projects: ${projects.length} registered`);
  }

  // Current project
  const projectRoot = findProjectRoot();
  if (projectRoot) {
    const marker = await readMarker(projectRoot);
    console.log(`✓ Current project: ${projectRoot}`);
    if (marker) {
      console.log(`  - Marker: v${marker.version} (${marker.tier})`);
      if (marker.extensions.length > 0) {
        console.log(`  - Extensions: ${marker.extensions.join(', ')}`);
      }
    }
  } else {
    console.log('— No VoidForge project detected in current directory tree');
  }

  console.log('');
}

async function cmdTemplates(): Promise<void> {
  const { listTemplates } = await import('../wizard/lib/templates.js');
  console.log('\nVoidForge Project Templates\n');
  for (const t of listTemplates()) {
    console.log(`  ${t.id.padEnd(12)} ${t.name}`);
    console.log(`  ${''.padEnd(12)} ${t.description}\n`);
  }
  console.log('Usage: npx voidforge init --template <id>\n');
}

async function cmdDeploy(): Promise<void> {
  const isHeadless = args.includes('--headless');
  const isSelfDeploy = args.includes('--self');
  const isEnvOnly = args.includes('--env-only');
  const projectDirFlag = args.find((a, i) => args[i - 1] === '--dir');
  const hostFlag = args.find((a, i) => args[i - 1] === '--host');

  if (isEnvOnly) {
    const { envOnlyDeploy } = await import('../wizard/lib/headless-deploy.js');
    await envOnlyDeploy(projectDirFlag);
  } else if (isSelfDeploy) {
    const { generateCaddyTemplate } = await import('../wizard/lib/provisioners/self-deploy.js');
    const domain = hostFlag ?? 'forge.yourdomain.com';
    console.log('\nVoidForge Self-Deploy\n');
    console.log('Generate the Caddy config and provision script with:');
    console.log('  npx voidforge deploy --self --host forge.yourdomain.com\n');
    console.log('Caddy template:\n');
    console.log(generateCaddyTemplate(domain));
  } else if (isHeadless) {
    const { headlessDeploy } = await import('../wizard/lib/headless-deploy.js');
    await headlessDeploy(projectDirFlag);
  } else {
    await launchWizard('deploy');
  }
}

async function launchWizard(mode: 'init' | 'deploy' = 'init'): Promise<void> {
  const port = parseInt(process.env['VOIDFORGE_PORT'] ?? '3141', 10);
  const isRemote = args.includes('--remote');
  const isLan = args.includes('--lan');
  const hostFlag = args.find((a, i) => args[i - 1] === '--host');

  const wizardNames: Record<string, { name: string; path: string }> = {
    init: { name: 'Gandalf', path: '/' },
    deploy: { name: 'Haku', path: '/deploy.html' },
  };

  const wizard = wizardNames[mode];
  const { startServer } = await import('../wizard/server.js');
  const { openBrowser } = await import('../wizard/lib/open-browser.js');

  const protocol = isRemote ? 'https' : 'http';
  const host = isRemote ? (hostFlag ?? 'localhost') : 'localhost';
  const url = `${protocol}://${host}:${port}${wizard.path}`;
  const modeLabel = isRemote ? ' (Remote Mode)' : isLan ? ' (LAN Mode)' : '';

  console.log('');
  console.log(`  VoidForge — ${wizard.name}${modeLabel}`);
  console.log(`  Server running at ${url}`);
  if (isLan) {
    console.log('  LAN Mode: Listening on all interfaces (0.0.0.0)');
    console.log('  Access from private network: http://<your-ip>:' + port + wizard.path);
    console.log('  Auth: optional password (no TOTP, no Caddy)');
  }
  if (isRemote) console.log('  Authentication: REQUIRED (5-layer security active)');
  console.log('  Press Ctrl+C to stop');
  console.log('');

  const serverOptions = isRemote ? { remote: true, host: hostFlag }
    : isLan ? { lan: true }
    : undefined;
  await startServer(port, serverOptions);
  if (!isRemote && !isLan) await openBrowser(url);
}

async function cmdInitHeadless(): Promise<void> {
  const nameFlag = args.find((a, i) => args[i - 1] === '--name');
  const dirFlag = args.find((a, i) => args[i - 1] === '--dir');
  const onelinerFlag = args.find((a, i) => args[i - 1] === '--oneliner');
  const domainFlag = args.find((a, i) => args[i - 1] === '--domain');
  const repoFlag = args.find((a, i) => args[i - 1] === '--repo');
  const isCore = args.includes('--core');

  if (!nameFlag) {
    console.error('Error: --name is required for headless init.');
    console.error('Usage: npx voidforge init --headless --name "My Project" [--dir path] [--oneliner "..."]');
    process.exit(1);
  }

  const defaultDir = join(
    process.env['HOME'] ?? process.env['USERPROFILE'] ?? '.',
    'Projects',
    nameFlag.replace(/[^a-zA-Z0-9-_ ]/g, '').replace(/\s+/g, '-').toLowerCase(),
  );
  const directory = dirFlag ?? defaultDir;

  const { createProject } = await import('../wizard/lib/project-init.js');
  const result = await createProject({
    name: nameFlag,
    directory,
    oneliner: onelinerFlag,
    domain: domainFlag,
    repoUrl: repoFlag,
    core: isCore,
  });

  console.log('');
  console.log(`  VoidForge — Project Created`);
  console.log(`  Name:      ${nameFlag}`);
  console.log(`  Directory: ${result.projectDir}`);
  console.log(`  Files:     ${result.filesCreated} methodology files`);
  console.log(`  Marker:    ${result.markerId}`);
  console.log('');
  console.log('  Next: cd into the project and start building with Claude Code.');
  console.log('');
}

async function cmdMigrateTreasury(): Promise<void> {
  const isDryRun = args.includes('--dry-run');

  // Parse --project=<id> or --project <id>
  let projectId: string | undefined;
  for (let i = 2; i < args.length; i++) {
    if (args[i].startsWith('--project=')) {
      projectId = args[i].slice('--project='.length);
    } else if (args[i] === '--project' && args[i + 1]) {
      projectId = args[i + 1];
    }
  }

  if (!projectId) {
    console.error('Error: --project=<id> is required.');
    console.error('Usage: npx voidforge migrate treasury --project=<id> [--dry-run]');
    console.error('\nList projects: npx voidforge doctor');
    process.exit(1);
  }

  const { preFlightCheck, migrateTreasury } = await import('../wizard/lib/treasury-migrator.js');
  const preflight = await preFlightCheck(projectId);

  console.log('\n  VoidForge v22.1 — Treasury Migration\n');
  console.log(`  Project:  ${preflight.project?.name ?? projectId}`);
  console.log(`  ID:       ${projectId}`);

  if (preflight.context) {
    console.log(`  Dir:      ${preflight.context.directory}`);
    console.log(`  Treasury: ${preflight.context.treasuryDir}`);
  }

  console.log(`  Global:   ${preflight.globalTreasuryDir} (${preflight.globalFileCount} files)`);
  console.log('');

  // Show warnings
  for (const warning of preflight.warnings) {
    console.log(`  Warning: ${warning}`);
  }

  // Check for errors
  if (preflight.errors.length > 0) {
    for (const error of preflight.errors) {
      console.error(`  Error: ${error}`);
    }
    console.error('\n  Migration aborted. Fix the errors above and retry.\n');
    process.exit(1);
  }

  if (!preflight.context) {
    console.error('  Error: Could not create project context.');
    process.exit(1);
  }

  console.log('  Plan:');
  if (preflight.globalTreasuryExists) {
    console.log('    1. Archive global treasury to ~/.voidforge/treasury-pre-v22/');
  }
  console.log(`    ${preflight.globalTreasuryExists ? '2' : '1'}. Create per-project treasury at ${preflight.context.treasuryDir}`);
  console.log(`    ${preflight.globalTreasuryExists ? '3' : '2'}. Initialize genesis log files (clean break — no data copy)`);
  console.log(`    ${preflight.globalTreasuryExists ? '4' : '3'}. Set 0700 permissions`);
  console.log(`    ${preflight.globalTreasuryExists ? '5' : '4'}. Write migration manifest (.migrated)`);

  if (preflight.globalTreasuryExists) {
    console.log(`    ${preflight.globalTreasuryExists ? '6' : '5'}. Validate archived hash chains`);
  }
  console.log('');

  if (isDryRun) {
    console.log('  (dry-run — no changes made)\n');
    return;
  }

  const result = await migrateTreasury(preflight.context);

  console.log('  Migration complete.');
  console.log(`  Archive:          ${result.archiveDir}`);
  console.log(`  Treasury:         ${result.treasuryDir}`);
  console.log(`  Spend log:        ${result.manifest.spendLogEntries} archived entries (chain ${result.manifest.spendLogHashValid ? 'valid' : 'BROKEN'})`);
  console.log(`  Revenue log:      ${result.manifest.revenueLogEntries} archived entries (chain ${result.manifest.revenueLogHashValid ? 'valid' : 'BROKEN'})`);
  console.log(`  Source files:     ${result.manifest.sourceFileCount}`);
  console.log('');
  console.log('  Per-project logs start fresh (genesis hash). Global data preserved in archive.');
  console.log('  To rollback: move archive back to ~/.voidforge/treasury/\n');
}

function showHelp(): void {
  console.log('VoidForge — From nothing, everything.\n');
  console.log('Usage: npx voidforge <command> [options]\n');
  console.log('Commands:');
  console.log('  (no command)       Launch the wizard (browser UI)');
  console.log('  init               Create a new project');
  console.log('  update             Update project methodology');
  console.log('  update --self      Update the wizard itself');
  console.log('  install <ext>      Add extension to current project');
  console.log('  uninstall <ext>    Remove extension from current project');
  console.log('  deploy             Deploy project');
  console.log('  migrate            Migrate v20.x project to v21.0');
  console.log('  migrate treasury   Migrate global treasury to per-project (v22.1)');
  console.log('  herald             Silver Surfer — select optimal agent roster via Haiku');
  console.log('  doctor             Check versions, compatibility, health');
  console.log('  version            Show version information');
  console.log('  templates          List project templates');
  console.log('\nOptions:');
  console.log('  --help, -h         Show this help');
  console.log('  --remote           Launch in remote mode (0.0.0.0 + auth)');
  console.log('  --lan              Launch in LAN mode');
  console.log('  --headless         CLI-only (no browser)');
  console.log('  --self             Deploy VoidForge itself');
  console.log('  --env-only         Write vault credentials to .env');
  console.log('');
}

// ── Router ───────────────────────────────────────────────

async function main(): Promise<void> {
  try {
    switch (command) {
      case 'version':
      case '--version':
      case '-v':
        await cmdVersion();
        break;

      case 'doctor':
        await cmdDoctor();
        break;

      case 'templates':
        await cmdTemplates();
        break;

      case 'deploy':
        await cmdDeploy();
        break;

      case 'herald': {
        // Silver Surfer — Herald dispatch: Haiku pre-scan selects optimal agent roster
        const commandFlag = args.find((_a, i) => args[i - 1] === '--command') ?? '';
        const focusFlag = args.find((_a, i) => args[i - 1] === '--focus') ?? undefined;
        const jsonMode = args.includes('--json');
        try {
          const { gatherHeraldContext, runHerald } = await import('../wizard/lib/herald.js');
          const { loadAgentRegistry, getRegistrySummary } = await import('../wizard/lib/agent-registry.js');
          const context = await gatherHeraldContext(commandFlag, '', focusFlag);
          const registry = await loadAgentRegistry();
          const summary = getRegistrySummary(registry);
          const result = await runHerald(context, registry);
          if (jsonMode) {
            console.log(JSON.stringify(result));
          } else {
            console.log(`\n  Silver Surfer scanned ${registry.length} agents for ${commandFlag || 'unknown command'}`);
            if (focusFlag) console.log(`  Focus bias: "${focusFlag}"`);
            console.log(`  Selected ${result.estimatedAgents} agents: ${result.roster.join(', ')}`);
            console.log(`  Reasoning: ${result.reasoning}\n`);
          }
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          if (jsonMode) {
            console.log(JSON.stringify({ roster: [], reasoning: `Herald unavailable: ${msg}`, estimatedAgents: 0 }));
          } else {
            console.log(`\n  Silver Surfer unavailable: ${msg}\n  Commands will use their default agent roster.\n`);
          }
        }
        break;
      }

      case 'install': {
        const extName = args[1];
        if (!extName) {
          const { listExtensions } = await import('../wizard/lib/extensions.js');
          console.log('\nAvailable extensions:\n');
          for (const ext of listExtensions()) {
            console.log(`  ${ext.name.padEnd(16)} ${ext.description}`);
          }
          console.log('\nUsage: npx voidforge install <extension>\n');
          break;
        }
        const { installExtension } = await import('../wizard/lib/extensions.js');
        const { findProjectRoot } = await import('../wizard/lib/marker.js');
        const projectRoot = findProjectRoot();
        if (!projectRoot) {
          console.error('Not a VoidForge project — run `npx voidforge init` first.');
          process.exit(1);
        }
        const result = await installExtension(projectRoot, extName);
        console.log(`\n  Extension "${extName}" installed (${result.filesCreated} files created).\n`);
        break;
      }

      case 'uninstall': {
        const extToRemove = args[1];
        if (!extToRemove) {
          console.error('Usage: npx voidforge uninstall <extension>');
          process.exit(1);
        }
        const { uninstallExtension } = await import('../wizard/lib/extensions.js');
        const { findProjectRoot: findRoot } = await import('../wizard/lib/marker.js');
        const root = findRoot();
        if (!root) {
          console.error('Not a VoidForge project — run `npx voidforge init` first.');
          process.exit(1);
        }
        await uninstallExtension(root, extToRemove);
        console.log(`\n  Extension "${extToRemove}" uninstalled.\n`);
        break;
      }

      case 'update': {
        if (args.includes('--self')) {
          const { selfUpdate } = await import('../wizard/lib/updater.js');
          const result = selfUpdate();
          console.log(result.message);
          process.exit(result.success ? 0 : 1);
        }
        // Auto-upgrade CLI if behind npm latest (unless --no-self-update)
        if (!args.includes('--self') && !args.includes('--extensions') && !args.includes('--no-self-update')) {
          try {
            const npmLatest = execSync('npm view thevoidforge version 2>/dev/null', { encoding: 'utf-8' }).trim();
            const localVersion = await getPackageVersion();
            if (npmLatest && localVersion && localVersion !== 'unknown' && npmLatest !== localVersion) {
              const [nMaj, nMin, nPatch] = npmLatest.split('.').map(Number);
              const [lMaj, lMin, lPatch] = localVersion.split('.').map(Number);
              const npmNum = nMaj * 10000 + nMin * 100 + nPatch;
              const localNum = lMaj * 10000 + lMin * 100 + lPatch;
              if (npmNum > localNum) {
                console.log(`\n  CLI is v${localVersion}, npm has v${npmLatest}. Upgrading...`);
                const { selfUpdate } = await import('../wizard/lib/updater.js');
                const upgradeResult = selfUpdate();
                if (upgradeResult.success) {
                  console.log(`  Upgraded to v${npmLatest}. Re-running update with new version...\n`);
                  // Re-exec with the new version — the new binary has the updated methodology
                  try {
                    execSync('npx thevoidforge update --no-self-update', { stdio: 'inherit' });
                  } catch { /* exit code propagated */ }
                  process.exit(0);
                } else {
                  console.log(`  Self-upgrade failed: ${upgradeResult.message}. Continuing with v${localVersion}...`);
                }
              }
            }
          } catch {
            // npm view failed — offline or registry issue. Continue with local version.
          }
        }
        if (args.includes('--extensions')) {
          const { readRegistry } = await import('../wizard/lib/project-registry.js');
          const { readMarker: readMkr } = await import('../wizard/lib/marker.js');
          const { getExtension } = await import('../wizard/lib/extensions.js');
          let updated = 0;
          try {
            const projects = await readRegistry();
            for (const p of projects) {
              const marker = await readMkr(p.directory);
              if (!marker || marker.extensions.length === 0) continue;
              for (const extName of marker.extensions) {
                const ext = getExtension(extName);
                if (ext) {
                  await ext.install(p.directory);
                  updated++;
                }
              }
            }
          } catch {
            // Registry read failure — non-fatal
          }
          console.log(`\n  Extensions updated across ${updated} project(s).\n`);
          break;
        }
        // Methodology update
        const { findProjectRoot: findProjRoot } = await import('../wizard/lib/marker.js');
        const projRoot = findProjRoot();
        if (!projRoot) {
          console.error('Not a VoidForge project — run `npx voidforge init` first.');
          process.exit(1);
        }
        const { diffMethodology, applyUpdate } = await import('../wizard/lib/updater.js');
        const plan = await diffMethodology(projRoot);
        if (plan.added.length === 0 && plan.modified.length === 0) {
          console.log('\n  Methodology is up to date. No changes needed.\n');
          break;
        }
        console.log('\n  VoidForge Update Plan (Bombadil)\n');
        if (plan.added.length > 0) {
          console.log(`  New files (${plan.added.length}):`);
          for (const f of plan.added) console.log(`    + ${f}`);
        }
        if (plan.modified.length > 0) {
          console.log(`  Modified (${plan.modified.length}):`);
          for (const f of plan.modified) console.log(`    ~ ${f}`);
        }
        if (plan.removed.length > 0) {
          console.log(`  Removed upstream (${plan.removed.length}):`);
          for (const f of plan.removed) console.log(`    - ${f} (kept locally)`);
        }
        console.log(`  Unchanged: ${plan.unchanged} files\n`);
        const result = await applyUpdate(projRoot);
        console.log(`  Updated to v${result.newVersion}. ${plan.added.length + plan.modified.length} files changed.\n`);
        break;
      }

      case 'migrate': {
        // Subcommand: migrate treasury --project=<id>
        if (args[1] === 'treasury') {
          await cmdMigrateTreasury();
          break;
        }

        const isDryRun = args.includes('--dry-run');
        const migrateDir = args.find((a, i) => args[i - 1] === '--dir') ?? process.cwd();
        const { detectV20Project, migrateProject } = await import('../wizard/lib/migrator.js');
        const migPlan = await detectV20Project(migrateDir);

        if (!migPlan.hasWizardDir) {
          console.log('\n  No wizard/ directory found — this is not a v20.x project.\n');
          break;
        }

        console.log('\n  VoidForge v21.0 — Migration\n');
        console.log('  Your project contains an embedded wizard (v20.x model).');
        console.log('  VoidForge now runs as a standalone application.\n');
        console.log('  Plan:');
        console.log(`    1. Backup wizard/ (${migPlan.wizardFileCount} files) to ~/.voidforge/migration-backup/`);
        if (migPlan.voidforgeDeps.length > 0) {
          console.log(`    2. Remove ${migPlan.voidforgeDeps.length} VoidForge deps from package.json`);
        }
        console.log('    3. Remove wizard/ directory');
        console.log('    4. Add .voidforge marker file');
        console.log('    5. Keep all methodology files in place\n');

        if (isDryRun) {
          console.log('  (dry-run — no changes made)\n');
          break;
        }

        const migResult = await migrateProject(migrateDir);
        console.log(`  Migration complete.`);
        console.log(`  Backup: ${migResult.backupDir}`);
        console.log(`  Files removed: ${migResult.wizardFilesRemoved}`);
        if (migResult.depsRemoved.length > 0) {
          console.log(`  Deps removed: ${migResult.depsRemoved.join(', ')}`);
        }
        console.log(`  Marker created: ${migResult.markerCreated}\n`);
        console.log('  To rollback: restore from the backup directory.\n');
        break;
      }

      case 'init':
        if (args.includes('--headless')) {
          await cmdInitHeadless();
        } else {
          await launchWizard('init');
        }
        break;

      case 'heartbeat': {
        const subCmd = args[1]; // start | stop | status
        if (subCmd !== 'start') {
          console.error('Usage: voidforge heartbeat start [--project-dir <path>]');
          process.exit(1);
        }

        // Parse --project-dir for per-project daemon (v22.0 ADR-041 P1-A)
        const projectDirIdx = args.indexOf('--project-dir');
        const projectDir = projectDirIdx >= 0 ? args[projectDirIdx + 1] : undefined;

        if (projectDir) {
          if (!existsSync(projectDir)) {
            console.error(`Project directory does not exist: ${projectDir}`);
            process.exit(1);
          }
          // Configure per-project paths BEFORE daemon starts
          const { configurePaths, checkGlobalDaemon } = await import('../wizard/lib/daemon-core.js');
          configurePaths(projectDir);

          // Dual-daemon guard
          const globalRunning = await checkGlobalDaemon();
          if (globalRunning) {
            console.error('A global heartbeat daemon is running at ~/.voidforge/run/.');
            console.error('Stop it first: kill $(cat ~/.voidforge/run/heartbeat.pid)');
            process.exit(1);
          }

          // Set project ID and dir for financial operations
          const { setDaemonProjectId, setDaemonProjectDir } = await import('../wizard/lib/heartbeat.js');
          setDaemonProjectDir(projectDir);

          // Look up project in registry for ID
          const { findByDirectory } = await import('../wizard/lib/project-registry.js');
          const project = await findByDirectory(resolve(projectDir));
          if (project) {
            setDaemonProjectId(project.id);
            console.log(`  Heartbeat daemon starting for project: ${project.name} (${project.id})`);
          } else {
            console.log(`  Heartbeat daemon starting for directory: ${projectDir} (not in registry)`);
          }
        }

        // Prompt for vault password
        const { createInterface } = await import('node:readline');
        const rl = createInterface({ input: process.stdin, output: process.stdout });
        const password = await new Promise<string>((res) => {
          rl.question('Vault password: ', (answer) => { rl.close(); res(answer); });
        });

        const { startHeartbeat } = await import('../wizard/lib/heartbeat.js');
        await startHeartbeat(password);
        break;
      }

      case '--help':
      case '-h':
        showHelp();
        break;

      case undefined:
        // No command — launch wizard
        await launchWizard('init');
        break;

      default:
        console.error(`Unknown command: ${command}`);
        showHelp();
        process.exit(1);
    }
  } catch (err: unknown) {
    console.error('Error:', (err as Error).message);
    process.exit(1);
  }
}

main();
