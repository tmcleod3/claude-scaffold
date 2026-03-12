#!/usr/bin/env npx tsx
/**
 * VoidForge CLI entry point
 * Usage: npx voidforge init
 */

import { resolve } from 'node:path';

const args = process.argv.slice(2);
const command = args[0];

if (command !== 'init') {
  console.log('VoidForge — From nothing, everything.\n');
  console.log('Usage:');
  console.log('  npx voidforge init    Launch the interactive setup wizard');
  console.log('');
  process.exit(command === '--help' || command === '-h' ? 0 : 1);
}

const port = parseInt(process.env['VOIDFORGE_PORT'] ?? '3141', 10);

async function main(): Promise<void> {
  const { startServer } = await import('../wizard/server.js');
  const { openBrowser } = await import('../wizard/lib/open-browser.js');

  const url = `http://localhost:${port}`;
  console.log('');
  console.log('  VoidForge — Interactive Setup Wizard');
  console.log(`  Server running at ${url}`);
  console.log('  Press Ctrl+C to stop');
  console.log('');

  await startServer(port);
  await openBrowser(url);
}

main().catch((err: unknown) => {
  console.error('Failed to start VoidForge wizard:', err);
  process.exit(1);
});
