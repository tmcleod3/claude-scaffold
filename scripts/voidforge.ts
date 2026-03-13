#!/usr/bin/env npx tsx
/**
 * VoidForge CLI entry point
 * Usage: npx voidforge init     — Launch Merlin (setup wizard)
 *        npx voidforge deploy   — Launch Strange (deploy wizard)
 */

const args = process.argv.slice(2);
const command = args[0];

if (command !== 'init' && command !== 'deploy') {
  console.log('VoidForge — From nothing, everything.\n');
  console.log('Usage:');
  console.log('  npx voidforge init      Launch Merlin — the setup wizard');
  console.log('  npx voidforge deploy    Launch Strange — the deploy wizard');
  console.log('');
  process.exit(command === '--help' || command === '-h' ? 0 : 1);
}

const port = parseInt(process.env['VOIDFORGE_PORT'] ?? '3141', 10);

const wizardNames: Record<string, { name: string; path: string }> = {
  init: { name: 'Merlin', path: '/' },
  deploy: { name: 'Strange', path: '/deploy.html' },
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
