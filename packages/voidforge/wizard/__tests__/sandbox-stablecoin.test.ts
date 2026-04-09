/**
 * Sandbox stablecoin adapter tests — realistic fake data for dev/demo mode.
 * Tier 1: Financial adapter correctness — sandbox must behave like production shape-wise.
 */

import { describe, it, expect } from 'vitest';
import {
  SandboxStablecoinSetup,
  SandboxStablecoinAdapter,
} from '../lib/financial/stablecoin/sandbox-stablecoin.js';
import { toCents } from '../lib/patterns/stablecoin-adapter.js';
import type { FundingPlanRef } from '../lib/patterns/stablecoin-adapter.js';
import type { Cents } from '../lib/patterns/funding-plan.js';

// ── SandboxStablecoinSetup ───────────────────────────

describe('SandboxStablecoinSetup', () => {
  const setup = new SandboxStablecoinSetup();
  const creds = { provider: 'circle' as const, apiKey: 'test-key', environment: 'sandbox' as const };

  it('authenticate should return valid tokens with permissions', async () => {
    const result = await setup.authenticate(creds);
    expect(result.valid).toBe(true);
    expect(result.accountId).toBeDefined();
    expect(result.accountId!.startsWith('sandbox_wallet_')).toBe(true);
    expect(result.permissions).toBeDefined();
    expect(result.permissions!.length).toBeGreaterThan(0);
    expect(result.permissions).toContain('read_balances');
    expect(result.permissions).toContain('initiate_payouts');
  });

  it('verifySupportedAssets should return USDC assets', async () => {
    const assets = await setup.verifySupportedAssets(creds);
    expect(assets.length).toBeGreaterThanOrEqual(1);
    const usdcAssets = assets.filter(a => a.asset === 'USDC');
    expect(usdcAssets.length).toBeGreaterThanOrEqual(1);
    // Should include ETH network
    const ethUsdc = usdcAssets.find(a => a.network === 'ETH');
    expect(ethUsdc).toBeDefined();
    expect(ethUsdc!.minRedemption).toBeGreaterThan(0);
  });

  it('verifyLinkedBank should return linked bank info', async () => {
    const result = await setup.verifyLinkedBank(creds);
    expect(result.linked).toBe(true);
    expect(result.bankId).toBeDefined();
    expect(result.bankName).toBeDefined();
    expect(result.accountLast4).toBe('4242');
  });

  it('getInitialBalances should return positive USDC balance', async () => {
    const balances = await setup.getInitialBalances(creds);
    expect(balances.length).toBeGreaterThanOrEqual(1);
    const usdcBalance = balances.find(b => b.asset === 'USDC');
    expect(usdcBalance).toBeDefined();
    expect(usdcBalance!.balanceCents).toBeGreaterThan(0);
    expect(usdcBalance!.provider).toBe('circle');
  });
});

// ── SandboxStablecoinAdapter ─────────────────────────

describe('SandboxStablecoinAdapter', () => {
  it('getBalances should return positive USDC balance', async () => {
    const adapter = new SandboxStablecoinAdapter(50_000);
    const balances = await adapter.getBalances();
    expect(balances.totalStablecoinCents).toBe(toCents(50_000));
    expect(balances.stablecoin).toHaveLength(1);
    expect(balances.stablecoin[0].asset).toBe('USDC');
    expect(balances.stablecoin[0].balanceCents).toBe(toCents(50_000));
    expect(balances.fiat).toHaveLength(0);
    expect(balances.totalFiatAvailableCents).toBe(0);
  });

  it('initiateOfframp should deduct balance', async () => {
    const adapter = new SandboxStablecoinAdapter(50_000);
    const plan: FundingPlanRef = {
      id: 'plan-001',
      sourceFundingId: 'src-001',
      destinationBankId: 'bank-001',
      requiredCents: toCents(10_000),
      idempotencyKey: 'idem-001',
    };

    const record = await adapter.initiateOfframp(plan, 'prev-hash');
    expect(record.status).toBe('pending');
    expect(record.amountCents).toBe(toCents(10_000));
    expect(record.feesCents).toBe(toCents(10));
    expect(record.netAmountCents).toBe(toCents(10_000) - toCents(10));
    expect(record.hash).toBeDefined();
    expect(record.hash.length).toBe(64); // SHA-256 hex

    // Balance should be reduced
    const balances = await adapter.getBalances();
    expect(balances.totalStablecoinCents).toBe(toCents(40_000));
  });

  it('getTransferStatus should progress through pending → processing → completed over 3 polls', async () => {
    const adapter = new SandboxStablecoinAdapter(50_000);
    const plan: FundingPlanRef = {
      id: 'plan-002',
      sourceFundingId: 'src-001',
      destinationBankId: 'bank-001',
      requiredCents: toCents(5_000),
      idempotencyKey: 'idem-002',
    };

    const record = await adapter.initiateOfframp(plan, 'prev-hash-2');

    // Poll 1: pending
    const status1 = await adapter.getTransferStatus(record.id);
    expect(status1.status).toBe('pending');
    expect(status1.completedAt).toBeUndefined();
    expect(status1.estimatedCompletionAt).toBeDefined();

    // Poll 2: processing
    const status2 = await adapter.getTransferStatus(record.id);
    expect(status2.status).toBe('processing');
    expect(status2.completedAt).toBeUndefined();

    // Poll 3: completed
    const status3 = await adapter.getTransferStatus(record.id);
    expect(status3.status).toBe('completed');
    expect(status3.completedAt).toBeDefined();
    expect(status3.estimatedCompletionAt).toBeUndefined();
  });

  it('cancelTransfer should refund balance for pending transfers', async () => {
    const adapter = new SandboxStablecoinAdapter(50_000);
    const plan: FundingPlanRef = {
      id: 'plan-003',
      sourceFundingId: 'src-001',
      destinationBankId: 'bank-001',
      requiredCents: toCents(10_000),
      idempotencyKey: 'idem-003',
    };

    const record = await adapter.initiateOfframp(plan, 'prev-hash-3');

    // Balance after offramp: $40k
    const beforeCancel = await adapter.getBalances();
    expect(beforeCancel.totalStablecoinCents).toBe(toCents(40_000));

    // Cancel the pending transfer
    const cancelResult = await adapter.cancelTransfer(record.id);
    expect(cancelResult.cancelled).toBe(true);

    // Balance should be restored
    const afterCancel = await adapter.getBalances();
    expect(afterCancel.totalStablecoinCents).toBe(toCents(50_000));
  });

  it('cancelTransfer should reject cancellation of completed transfers', async () => {
    const adapter = new SandboxStablecoinAdapter(50_000);
    const plan: FundingPlanRef = {
      id: 'plan-004',
      sourceFundingId: 'src-001',
      destinationBankId: 'bank-001',
      requiredCents: toCents(5_000),
      idempotencyKey: 'idem-004',
    };

    const record = await adapter.initiateOfframp(plan, 'prev-hash-4');

    // Advance to completed (3 polls)
    await adapter.getTransferStatus(record.id);
    await adapter.getTransferStatus(record.id);
    await adapter.getTransferStatus(record.id);

    const cancelResult = await adapter.cancelTransfer(record.id);
    expect(cancelResult.cancelled).toBe(false);
    expect(cancelResult.reason).toContain('already completed');
  });

  it('getTransferStatus should return failed for unknown transfer IDs', async () => {
    const adapter = new SandboxStablecoinAdapter(50_000);
    const status = await adapter.getTransferStatus('nonexistent-id');
    expect(status.status).toBe('failed');
    expect(status.providerRawStatus).toBe('not_found');
    expect(status.amountCents).toBe(0);
  });

  it('cancelTransfer should fail for unknown transfer IDs', async () => {
    const adapter = new SandboxStablecoinAdapter(50_000);
    const result = await adapter.cancelTransfer('nonexistent-id');
    expect(result.cancelled).toBe(false);
    expect(result.reason).toContain('not found');
  });

  it('quoteRedemption should return valid quote with flat fee', async () => {
    const adapter = new SandboxStablecoinAdapter(50_000);
    const quote = await adapter.quoteRedemption(toCents(10_000));
    expect(quote.provider).toBe('circle');
    expect(quote.requestedCents).toBe(toCents(10_000));
    expect(quote.estimatedFeeCents).toBe(toCents(10));
    expect(quote.estimatedNetCents).toBe(toCents(10_000) - toCents(10));
    expect(quote.estimatedSettlementMinutes).toBe(60);
    expect(quote.expiresAt).toBeDefined();
  });
});
