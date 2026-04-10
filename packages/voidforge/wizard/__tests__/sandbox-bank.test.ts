/**
 * Sandbox Bank adapter tests — connection, transactions, balance, currency detection.
 * Full implementation with realistic fake data — no external calls.
 */

import { describe, it, expect } from 'vitest';
import { SandboxBankAdapter } from '../lib/adapters/sandbox-bank.js';

describe('SandboxBankAdapter', () => {
  it('connects successfully with account info', async () => {
    const adapter = new SandboxBankAdapter('Test Bank', 100000);
    const result = await adapter.connect({ source: 'stripe' as never });

    expect(result.connected).toBe(true);
    expect(result.accountName).toBe('Test Bank');
    expect(result.accountId).toMatch(/^sandbox_bank_/);
    expect(result.currency).toBe('USD');
  });

  it('uses default label and balance', async () => {
    const adapter = new SandboxBankAdapter();
    const result = await adapter.connect({ source: 'stripe' as never });
    expect(result.accountName).toBe('Sandbox Bank');
  });

  it('returns transactions for a valid date range', async () => {
    const adapter = new SandboxBankAdapter();
    const page = await adapter.getTransactions({
      start: '2025-01-01',
      end: '2025-01-03',
    });

    expect(page.transactions.length).toBeGreaterThan(0);
    expect(page.hasMore).toBe(false);
    // Verify transaction shape
    const tx = page.transactions[0];
    expect(tx.externalId).toMatch(/^txn_/);
    expect(typeof tx.amount).toBe('number');
    expect(tx.currency).toBe('USD');
    expect(typeof tx.description).toBe('string');
    expect(tx.createdAt).toBeDefined();
  });

  it('returns empty transactions for invalid date range (end before start)', async () => {
    const adapter = new SandboxBankAdapter();
    const page = await adapter.getTransactions({
      start: '2025-01-10',
      end: '2025-01-01',
    });

    expect(page.transactions).toEqual([]);
    expect(page.hasMore).toBe(false);
  });

  it('returns balance with available and pending amounts', async () => {
    const adapter = new SandboxBankAdapter('Bank', 250000);
    const balance = await adapter.getBalance();

    expect(typeof balance.available).toBe('number');
    expect(typeof balance.pending).toBe('number');
    expect(balance.currency).toBe('USD');
  });

  it('detects currency as USD', async () => {
    const adapter = new SandboxBankAdapter();
    const currency = await adapter.detectCurrency({ source: 'stripe' as never });
    expect(currency).toBe('USD');
  });
});
