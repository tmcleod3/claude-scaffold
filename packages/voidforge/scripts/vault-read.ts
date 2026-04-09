#!/usr/bin/env npx tsx
/**
 * Standalone vault reader — read a single key from the encrypted vault.
 *
 * Usage:
 *   npx tsx scripts/vault-read.ts --key "env:WHATSAPP_ACCESS_TOKEN"
 *   npx tsx scripts/vault-read.ts --list
 *
 * For non-interactive use (CI/CD), set VOIDFORGE_VAULT_PASSWORD env var.
 */

import { createInterface } from 'node:readline';
import { vaultExists, vaultUnlock, vaultGet, vaultKeys } from '../wizard/lib/vault.js';

const args = process.argv.slice(2);
const keyFlag = args.find((_, i) => args[i - 1] === '--key');
const listMode = args.includes('--list');

if (!keyFlag && !listMode) {
  console.log('Usage:');
  console.log('  npx tsx scripts/vault-read.ts --key "env:WHATSAPP_ACCESS_TOKEN"');
  console.log('  npx tsx scripts/vault-read.ts --list');
  console.log('');
  console.log('Set VOIDFORGE_VAULT_PASSWORD env var for non-interactive use.');
  process.exit(1);
}

if (!vaultExists()) {
  console.error('No vault found at ~/.voidforge/vault.enc');
  process.exit(1);
}

async function getPassword(): Promise<string> {
  const envPassword = process.env['VOIDFORGE_VAULT_PASSWORD'];
  if (envPassword) return envPassword;

  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    process.stdout.write('Vault password: ');
    const stdin = process.stdin;
    const wasRaw = stdin.isRaw;
    if (stdin.isTTY && stdin.setRawMode) {
      stdin.setRawMode(true);
    }
    let password = '';
    const onData = (ch: Buffer) => {
      const c = ch.toString();
      if (c === '\n' || c === '\r') {
        stdin.removeListener('data', onData);
        if (stdin.isTTY && stdin.setRawMode) stdin.setRawMode(wasRaw ?? false);
        process.stdout.write('\n');
        rl.close();
        resolve(password);
      } else if (c === '\u007f' || c === '\b') {
        password = password.slice(0, -1);
      } else if (c === '\u0003') {
        process.exit(1);
      } else {
        password += c;
      }
    };
    stdin.on('data', onData);
  });
}

async function main(): Promise<void> {
  const password = await getPassword();
  const valid = await vaultUnlock(password);
  if (!valid) {
    console.error('Wrong vault password');
    process.exit(1);
  }

  if (listMode) {
    const keys = await vaultKeys(password);
    for (const key of keys) {
      console.log(key);
    }
    return;
  }

  const value = await vaultGet(password, keyFlag!);
  if (value === null) {
    console.error(`Key not found: ${keyFlag}`);
    process.exit(1);
  }
  // Output value only — suitable for piping
  process.stdout.write(value);
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
