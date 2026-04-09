/**
 * Sandbox Stablecoin Adapter — full implementation for development/demo.
 *
 * Returns realistic fake data matching the StablecoinSetup + StablecoinAdapter
 * interfaces. Every method returns valid-shaped data. No throws.
 * This IS a full implementation for a sandbox provider (No Stubs Doctrine).
 *
 * Simulates a USDC wallet with ~$50,000 starting balance, realistic off-ramp
 * lifecycle (pending -> processing -> completed over 3 polls), and deterministic
 * fee estimates.
 */

import { randomUUID, createHash } from 'node:crypto';
import type {
  StablecoinSetup, StablecoinAdapter,
  ProviderCredentials, SupportedAsset, StablecoinBalance,
  CombinedBalances, OfframpQuote, TransferRecord,
  TransferStatusDetail, TransferStatus, FundingPlanRef, DateRange,
} from './base.js';
import { toCents, toDollars, computeTransferHash } from './base.js';

type Cents = number & { readonly __brand: 'Cents' };

// ── Internal Transfer State ──────────────────────────

interface SandboxTransferState {
  record: TransferRecord;
  pollCount: number;        // tracks how many times status was polled
}

// ── Setup Implementation ─────────────────────────────

export class SandboxStablecoinSetup implements StablecoinSetup {
  async authenticate(_credentials: ProviderCredentials): Promise<{
    valid: boolean;
    accountId?: string;
    permissions?: string[];
    error?: string;
  }> {
    return {
      valid: true,
      accountId: `sandbox_wallet_${randomUUID().slice(0, 8)}`,
      permissions: ['read_balances', 'initiate_payouts', 'read_payouts'],
    };
  }

  async verifySupportedAssets(_credentials: ProviderCredentials): Promise<SupportedAsset[]> {
    return [
      {
        asset: 'USDC',
        network: 'ETH',
        contractAddress: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
        minRedemption: toCents(100),
      },
      {
        asset: 'USDC',
        network: 'SOL',
        contractAddress: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
        minRedemption: toCents(50),
      },
    ];
  }

  async verifyLinkedBank(_credentials: ProviderCredentials): Promise<{
    linked: boolean;
    bankId?: string;
    bankName?: string;
    accountLast4?: string;
    error?: string;
  }> {
    return {
      linked: true,
      bankId: 'sandbox_bank_001',
      bankName: 'Sandbox Mercury Account',
      accountLast4: '4242',
    };
  }

  async getInitialBalances(_credentials: ProviderCredentials): Promise<StablecoinBalance[]> {
    return [
      {
        provider: 'circle',
        asset: 'USDC',
        network: 'ETH',
        balanceCents: toCents(50_000),
        lastUpdated: new Date().toISOString(),
      },
    ];
  }
}

// ── Runtime Adapter Implementation ───────────────────

export class SandboxStablecoinAdapter implements StablecoinAdapter {
  private balanceCents: Cents;
  private transfers = new Map<string, SandboxTransferState>();

  constructor(initialBalanceDollars: number = 50_000) {
    this.balanceCents = toCents(initialBalanceDollars);
  }

  async getBalances(): Promise<CombinedBalances> {
    const now = new Date().toISOString();
    const stablecoin: StablecoinBalance[] = [
      {
        provider: 'circle',
        asset: 'USDC',
        network: 'ETH',
        balanceCents: this.balanceCents,
        lastUpdated: now,
      },
    ];

    return {
      stablecoin,
      fiat: [],
      totalStablecoinCents: this.balanceCents,
      totalFiatAvailableCents: 0 as Cents,
    };
  }

  async quoteRedemption(amountCents: Cents): Promise<OfframpQuote> {
    // Sandbox fee: flat $10 per off-ramp
    const feeCents = toCents(10);
    return {
      provider: 'circle',
      sourceAsset: 'USDC',
      sourceNetwork: 'ETH',
      requestedCents: amountCents,
      estimatedFeeCents: feeCents,
      estimatedNetCents: (amountCents - feeCents) as Cents,
      estimatedSettlementMinutes: 60,
      expiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
    };
  }

  async initiateOfframp(plan: FundingPlanRef, previousHash: string): Promise<TransferRecord> {
    const feeCents = toCents(10);
    const netCents = (plan.requiredCents - feeCents) as Cents;
    const now = new Date().toISOString();
    const id = randomUUID();
    const providerTransferId = `sandbox_xfer_${randomUUID().slice(0, 12)}`;

    // Deduct from simulated balance
    this.balanceCents = (this.balanceCents - plan.requiredCents) as Cents;

    const record: Omit<TransferRecord, 'hash'> = {
      id,
      fundingPlanId: plan.id,
      providerTransferId,
      provider: 'circle',
      direction: 'crypto_to_fiat',
      sourceAsset: 'USDC',
      sourceNetwork: 'ETH',
      amountCents: plan.requiredCents,
      feesCents: feeCents,
      netAmountCents: netCents,
      destinationBankId: plan.destinationBankId,
      status: 'pending',
      initiatedAt: now,
      idempotencyKey: plan.idempotencyKey,
      previousHash,
    };

    const hash = computeTransferHash(record, previousHash);
    const fullRecord: TransferRecord = { ...record, hash };

    this.transfers.set(id, { record: fullRecord, pollCount: 0 });
    return fullRecord;
  }

  async getTransferStatus(transferId: string): Promise<TransferStatusDetail> {
    const state = this.transfers.get(transferId);
    if (!state) {
      // Return failed status for unknown IDs — unknown transfers should not
      // be reported as completed (could cause false settlement in reconciliation).
      return {
        transferId,
        providerTransferId: 'unknown',
        status: 'failed',
        amountCents: 0 as Cents,
        feesCents: 0 as Cents,
        initiatedAt: new Date().toISOString(),
        providerRawStatus: 'not_found',
      };
    }

    // Simulate lifecycle: pending (poll 0) -> processing (poll 1) -> completed (poll 2+)
    state.pollCount += 1;
    let status: TransferStatus;
    let rawStatus: string;
    let completedAt: string | undefined;

    if (state.pollCount <= 1) {
      status = 'pending';
      rawStatus = 'pending';
    } else if (state.pollCount === 2) {
      status = 'processing';
      rawStatus = 'processing';
    } else {
      status = 'completed';
      rawStatus = 'complete';
      completedAt = new Date().toISOString();
      // Update stored record status
      state.record = { ...state.record, status: 'completed', completedAt };
    }

    return {
      transferId: state.record.id,
      providerTransferId: state.record.providerTransferId,
      status,
      amountCents: state.record.amountCents,
      feesCents: state.record.feesCents,
      initiatedAt: state.record.initiatedAt,
      completedAt,
      estimatedCompletionAt: status !== 'completed'
        ? new Date(Date.now() + 60 * 60 * 1000).toISOString()
        : undefined,
      providerRawStatus: rawStatus,
    };
  }

  async cancelTransfer(transferId: string): Promise<{ cancelled: boolean; reason?: string }> {
    const state = this.transfers.get(transferId);
    if (!state) {
      return { cancelled: false, reason: 'Transfer not found' };
    }
    if (state.record.status === 'completed') {
      return { cancelled: false, reason: 'Transfer already completed' };
    }
    if (state.record.status === 'processing') {
      return { cancelled: false, reason: 'Transfer is processing — cannot cancel' };
    }

    // Refund the balance and mark cancelled
    this.balanceCents = (this.balanceCents + state.record.amountCents) as Cents;
    state.record = { ...state.record, status: 'cancelled' };
    return { cancelled: true };
  }

  async listCompletedTransfers(_dateRange: DateRange): Promise<TransferRecord[]> {
    const completed: TransferRecord[] = [];
    for (const state of this.transfers.values()) {
      if (state.record.status === 'completed') {
        completed.push(state.record);
      }
    }
    return completed;
  }
}
