#!/usr/bin/env npx tsx
/**
 * VoidForge CLI entry point
 * Usage: npx voidforge init                    — Launch Merlin (setup wizard)
 *        npx voidforge init --template saas    — Start from a project template
 *        npx voidforge deploy                  — Launch Haku (deploy wizard)
 *        npx voidforge deploy --headless       — Deploy from CLI (no browser)
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
  console.log('  npx voidforge init                    Launch Merlin — the setup wizard');
  console.log('  npx voidforge init --template saas    Start from a project template');
  console.log('  npx voidforge deploy              Launch Haku — the deploy wizard');
  console.log('  npx voidforge deploy --headless   Deploy from CLI without a browser');
  console.log('');
  process.exit(command === '--help' || command === '-h' ? 0 : 1);
}

const isHeadless = args.includes('--headless');
const projectDirFlag = args.find((a, i) => args[i - 1] === '--dir');

if (command === 'deploy' && isHeadless) {
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
    init: { name: 'Merlin', path: '/' },
    deploy: { name: 'Haku', path: '/deploy.html' },
  };

  const wizard = wizardNames[command];

  async function main(): Promise<void> {
    const { startServer } = await import('../wizard/server.js');
    const { openBrowser } = await import('../wizard/lib/open-browser.js');

    const url = `http://localhost:${port}${wizard.path}`;
    console.log('');
    console.log(`  VoidForge — ${wizard.name}`);
    console.log(`  Server running at ${url}`);
    console.log('  Press Ctrl+C to stop');
    console.log('');

    await startServer(port);
    await openBrowser(url);
  }

  main().catch((err: unknown) => {
    console.error('Failed to start VoidForge:', err);
    process.exit(1);
  });
}
