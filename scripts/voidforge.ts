#!/usr/bin/env npx tsx
/**
 * VoidForge CLI entry point
 * Usage: npx voidforge init                    — Launch Gandalf (setup wizard)
 *        npx voidforge init --template saas    — Start from a project template
 *        npx voidforge init --remote           — Launch in remote mode (0.0.0.0 + auth)
 *        npx voidforge deploy                  — Launch Haku (deploy wizard)
 *        npx voidforge deploy --headless       — Deploy from CLI (no browser)
 *        npx voidforge deploy --env-only       — Write vault credentials to .env (no provisioning)
 *        npx voidforge deploy --self           — Deploy VoidForge itself to a VPS
 *        npx voidforge templates               — List available project templates
 */

const args = process.argv.slice(2);
const command = args[0];

if (command === 'templates') {
  import('../wizard/lib/templates.js').then(({ listTemplates }) => {
    console.log('\nVoidForge Project Templates\n');
    for (const t of listTemplates()) {
      console.log(`  ${t.id.padEnd(12)} ${t.name}`);
      console.log(`  ${''.padEnd(12)} ${t.description}\n`);
    }
    console.log('Usage: npx voidforge init --template <id>\n');
  });
} else if (command !== 'init' && command !== 'deploy') {
  console.log('VoidForge — From nothing, everything.\n');
  console.log('Usage:');
  console.log('  npx voidforge init                    Launch Gandalf — the setup wizard');
  console.log('  npx voidforge init --template saas    Start from a project template');
  console.log('  npx voidforge deploy              Launch Haku — the deploy wizard');
  console.log('  npx voidforge deploy --headless   Deploy from CLI without a browser');
  console.log('  npx voidforge deploy --env-only   Write vault credentials to .env (no provisioning)');
  console.log('');
  process.exit(command === '--help' || command === '-h' ? 0 : 1);
}

const isHeadless = args.includes('--headless');
const isRemote = args.includes('--remote');
const isSelfDeploy = args.includes('--self');
const isEnvOnly = args.includes('--env-only');
const projectDirFlag = args.find((a, i) => args[i - 1] === '--dir');
const hostFlag = args.find((a, i) => args[i - 1] === '--host');

if (command === 'deploy' && isEnvOnly) {
  // Env-only deploy — write vault credentials to .env without provisioning
  import('../wizard/lib/headless-deploy.js')
    .then(({ envOnlyDeploy }) => envOnlyDeploy(projectDirFlag))
    .catch((err: unknown) => {
      console.error('Env deploy failed:', (err as Error).message);
      process.exit(1);
    });
} else if (command === 'deploy' && isSelfDeploy) {
  // Self-deploy — deploy VoidForge itself to a remote VPS
  import('../wizard/lib/provisioners/self-deploy.js')
    .then(({ generateCaddyTemplate }) => {
      const domain = hostFlag ?? 'forge.yourdomain.com';
      console.log('\nVoidForge Self-Deploy\n');
      console.log('Generate the Caddy config and provision script with:');
      console.log('  npx voidforge deploy --self --host forge.yourdomain.com\n');
      console.log('Caddy template:\n');
      console.log(generateCaddyTemplate(domain));
    })
    .catch((err: unknown) => {
      console.error('Self-deploy failed:', (err as Error).message);
      process.exit(1);
    });
} else if (command === 'deploy' && isHeadless) {
  // Headless deploy — run provisioning from terminal
  import('../wizard/lib/headless-deploy.js')
    .then(({ headlessDeploy }) => headlessDeploy(projectDirFlag))
    .catch((err: unknown) => {
      console.error('Deploy failed:', (err as Error).message);
      process.exit(1);
    });
} else {
  // Browser wizard mode
  const port = parseInt(process.env['VOIDFORGE_PORT'] ?? '3141', 10);

  const wizardNames: Record<string, { name: string; path: string }> = {
    init: { name: 'Gandalf', path: '/' },
    deploy: { name: 'Haku', path: '/deploy.html' },
  };

  const wizard = wizardNames[command];

  async function main(): Promise<void> {
    const { startServer } = await import('../wizard/server.js');
    const { openBrowser } = await import('../wizard/lib/open-browser.js');

    const protocol = isRemote ? 'https' : 'http';
    const host = isRemote ? (hostFlag ?? 'localhost') : 'localhost';
    const url = `${protocol}://${host}:${port}${wizard.path}`;
    console.log('');
    console.log(`  VoidForge — ${wizard.name}${isRemote ? ' (Remote Mode)' : ''}`);
    console.log(`  Server running at ${url}`);
    if (isRemote) console.log('  Authentication: REQUIRED (5-layer security active)');
    console.log('  Press Ctrl+C to stop');
    console.log('');

    await startServer(port, isRemote ? { remote: true, host: hostFlag } : undefined);
    if (!isRemote) await openBrowser(url);
  }

  main().catch((err: unknown) => {
    console.error('Failed to start VoidForge:', err);
    process.exit(1);
  });
}
