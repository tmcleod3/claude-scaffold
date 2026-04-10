/**
 * Treasury Socket Handlers — HTTP-style request handlers for the treasury API.
 *
 * Handles POST/GET routes over the daemon's Unix socket:
 *   POST /treasury/offramp   — Initiate off-ramp (vault+TOTP required)
 *   POST /treasury/freeze    — Manual freeze
 *   POST /treasury/unfreeze  — Manual unfreeze (vault+TOTP required)
 *   GET  /treasury/balances  — Balance snapshot
 *   GET  /treasury/funding-status — Funding pipeline status
 *   GET  /treasury/runway    — Runway forecast
 *
 * PRD Reference: S10.4, S16
 */

import { appendFile, mkdir } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';

import { TREASURY_DIR } from './financial-core.js';
import type { Cents } from './financial-core.js';

import { generateFundingPlan } from './financial/treasury-planner.js';
import type { FundingPlanConfig, ObligationInput } from './financial/treasury-planner.js';

import { evaluatePolicy, aggregateDecisions } from './financial/funding-policy.js';
import type { TreasuryState } from './financial/funding-policy.js';

import {
  getTreasuryState,
  saveTreasuryState,
  isStablecoinConfigured,
  readPendingTransfers,
  writePendingTransfers,
  writeWalEntry,
  FUNDING_PLANS_LOG,
  TRANSFERS_LOG,
} from './treasury-io.js';
import type { Logger, FreezeFn } from './treasury-io.js';

// ── Treasury Socket Handlers ─────────────────────────

export async function handleTreasuryRequest(
  method: string,
  path: string,
  _body: unknown,
  auth: { vaultVerified: boolean; totpVerified: boolean },
  logger: Logger,
  triggerFreeze: FreezeFn,
  vaultKey: string | null,
): Promise<{ status: number; body: unknown } | null> {

  const treasuryState = getTreasuryState();

  // POST /treasury/offramp — vault+TOTP required
  if (method === 'POST' && path === '/treasury/offramp') {
    if (!auth.vaultVerified || !auth.totpVerified) {
      return {
        status: 403,
        body: { ok: false, error: 'Off-ramp requires valid vault password + TOTP code' },
      };
    }

    if (!isStablecoinConfigured()) {
      return {
        status: 400,
        body: { ok: false, error: 'Stablecoin funding not configured' },
      };
    }

    if (treasuryState.fundingFrozen) {
      return {
        status: 423,
        body: { ok: false, error: `Funding frozen: ${treasuryState.freezeReason ?? 'unknown reason'}` },
      };
    }

    logger.log('Off-ramp requested via treasury API');

    // Write WAL entry first (ADR-3)
    const intentId = randomUUID();
    await writeWalEntry({
      intentId,
      operation: 'offramp',
      params: _body,
      status: 'pending',
      createdAt: new Date().toISOString(),
    });

    try {
      const { getStablecoinAdapter } = await import('./financial/adapter-factory.js');
      const adapter = await getStablecoinAdapter(vaultKey, logger);

      // Generate a funding plan using treasury planner
      const bankBalance = treasuryState.bankBalanceCents as Cents;
      const source = {
        id: 'default-source',
        provider: 'circle' as const,
        asset: 'USDC',
        network: 'ETH',
        sourceAccountId: 'default',
        whitelistedDestinationBankId: 'default-bank',
        status: 'active' as const,
      };
      const bank = {
        id: 'default-bank',
        provider: 'mercury' as const,
        accountId: 'default',
        currency: 'USD' as const,
        availableBalanceCents: bankBalance,
        reservedBalanceCents: 0 as Cents,
        minimumBufferCents: 50_000 as Cents, // $500
      };
      const config: FundingPlanConfig = {
        minimumOfframpCents: 10_000 as Cents, // $100
        bufferTargetCents: 100_000 as Cents, // $1,000
        maxDailyOfframpCents: 5_000_000 as Cents, // $50,000
        targetRunwayDays: 30,
      };
      const obligations: ObligationInput[] = [];

      const plan = generateFundingPlan(source, bank, obligations, config, '');
      if (!plan) {
        return {
          status: 200,
          body: { ok: true, message: 'No funding needed — balance sufficient' },
        };
      }

      // Evaluate policy before executing
      const policyState: TreasuryState = {
        bankBalanceCents: bank.availableBalanceCents,
        minimumBufferCents: bank.minimumBufferCents,
        reservedCents: bank.reservedBalanceCents,
        proposedOfframpCents: plan.requiredCents,
        maxDailyMovementCents: config.maxDailyOfframpCents,
        googleInvoiceDueSoon: false,
        googleInvoiceCents: 0 as Cents,
        metaUsesDirectDebit: false,
        metaForecast7DayCents: 0 as Cents,
        debitProtectionBufferCents: 0 as Cents,
        discrepancyExists: treasuryState.consecutiveMismatches > 0,
        proposingBudgetRaise: false,
        platformCapability: 'FULLY_FUNDABLE',
        claimingAutonomousFunding: false,
      };

      const decisions = evaluatePolicy(policyState);
      const aggregate = aggregateDecisions(decisions);

      if (aggregate.action === 'freeze') {
        await triggerFreeze(aggregate.blockingRules.map(r => r.reason).join('; '));
        return {
          status: 423,
          body: { ok: false, error: 'Policy freeze triggered', rules: aggregate.blockingRules },
        };
      }

      if (aggregate.action === 'deny') {
        return {
          status: 403,
          body: {
            ok: false,
            error: 'Policy denied off-ramp',
            rules: aggregate.blockingRules,
          },
        };
      }

      // Initiate the off-ramp
      const planRef = {
        id: plan.id,
        sourceFundingId: plan.sourceFundingId,
        destinationBankId: plan.destinationBankId,
        requiredCents: plan.requiredCents,
        idempotencyKey: plan.idempotencyKey,
      };

      const transfer = await adapter.initiateOfframp(planRef, plan.hash);

      // Log the plan and transfer
      await mkdir(TREASURY_DIR, { recursive: true });
      await appendFile(FUNDING_PLANS_LOG, JSON.stringify(plan) + '\n', 'utf-8');
      await appendFile(TRANSFERS_LOG, JSON.stringify(transfer) + '\n', 'utf-8');

      // Track pending transfer
      const pending = await readPendingTransfers();
      pending.push({
        id: transfer.id,
        fundingPlanId: plan.id,
        providerTransferId: transfer.providerTransferId,
        amountCents: transfer.amountCents as number,
        status: 'pending',
        initiatedAt: transfer.initiatedAt,
        lastPolledAt: transfer.initiatedAt,
      });
      await writePendingTransfers(pending);

      // Update treasury state
      treasuryState.pendingTransferCount += 1;
      treasuryState.lastOfframpAt = new Date().toISOString();

      // Track daily movement for CB-6
      const today = new Date().toISOString().slice(0, 10);
      if (treasuryState.dailyMovementDate !== today) {
        treasuryState.dailyMovementCents = 0;
        treasuryState.dailyMovementDate = today;
      }
      treasuryState.dailyMovementCents += plan.requiredCents as number;

      // Complete WAL
      await writeWalEntry({
        intentId,
        operation: 'offramp',
        params: { planId: plan.id, transferId: transfer.id },
        status: 'completed',
        createdAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
      });

      await saveTreasuryState();

      logger.log(
        `Off-ramp initiated: $${((plan.requiredCents as number) / 100).toFixed(2)} ` +
        `via ${transfer.provider} (transfer ${transfer.id})`,
      );

      return {
        status: 200,
        body: {
          ok: true,
          message: 'Off-ramp initiated',
          plan: { id: plan.id, amountCents: plan.requiredCents, reason: plan.reason },
          transfer: { id: transfer.id, status: transfer.status, provider: transfer.provider },
        },
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Off-ramp failed';
      logger.log(`Off-ramp error: ${msg}`);

      await writeWalEntry({
        intentId,
        operation: 'offramp',
        params: _body,
        status: 'failed',
        createdAt: new Date().toISOString(),
        error: msg,
      });

      return { status: 500, body: { ok: false, error: `Off-ramp failed: ${msg}` } };
    }
  }

  // POST /treasury/freeze — session token only (protective)
  if (method === 'POST' && path === '/treasury/freeze') {
    logger.log('Treasury FREEZE command received');
    treasuryState.fundingFrozen = true;
    treasuryState.freezeReason = 'Manual freeze via treasury API';
    await saveTreasuryState();
    return { status: 200, body: { ok: true, message: 'Funding frozen' } };
  }

  // POST /treasury/unfreeze — vault+TOTP required
  if (method === 'POST' && path === '/treasury/unfreeze') {
    if (!auth.vaultVerified || !auth.totpVerified) {
      return {
        status: 403,
        body: { ok: false, error: 'Unfreeze requires valid vault password + TOTP code' },
      };
    }

    logger.log('Treasury UNFREEZE command received');
    treasuryState.fundingFrozen = false;
    treasuryState.freezeReason = null;
    // Reset circuit breaker counters on unfreeze
    treasuryState.consecutiveMismatches = 0;
    treasuryState.consecutiveProviderFailures = 0;
    await saveTreasuryState();
    return { status: 200, body: { ok: true, message: 'Funding unfrozen' } };
  }

  // GET /treasury/balances — session token only
  if (method === 'GET' && path === '/treasury/balances') {
    return {
      status: 200,
      body: {
        ok: true,
        data: {
          stablecoinBalanceCents: treasuryState.stablecoinBalanceCents,
          bankBalanceCents: treasuryState.bankBalanceCents,
          totalAvailableCents:
            treasuryState.stablecoinBalanceCents + treasuryState.bankBalanceCents,
          pendingTransferCount: treasuryState.pendingTransferCount,
          fundingFrozen: treasuryState.fundingFrozen,
        },
      },
    };
  }

  // GET /treasury/funding-status — session token only
  if (method === 'GET' && path === '/treasury/funding-status') {
    const pending = await readPendingTransfers();
    const activePending = pending.filter(
      t => t.status === 'pending' || t.status === 'processing',
    );

    return {
      status: 200,
      body: {
        ok: true,
        data: {
          pendingPlans: activePending.length,
          pendingTransfers: activePending.map(t => ({
            id: t.id,
            amountCents: t.amountCents,
            status: t.status,
            initiatedAt: t.initiatedAt,
          })),
          runwayDays: treasuryState.runwayDays,
          fundingFrozen: treasuryState.fundingFrozen,
          freezeReason: treasuryState.freezeReason,
          lastOfframpAt: treasuryState.lastOfframpAt,
          lastReconciliationAt: treasuryState.lastReconciliationAt,
          consecutiveMismatches: treasuryState.consecutiveMismatches,
        },
      },
    };
  }

  // GET /treasury/runway — session token only
  if (method === 'GET' && path === '/treasury/runway') {
    return {
      status: 200,
      body: {
        ok: true,
        data: {
          runwayDays: treasuryState.runwayDays,
          bankBalanceCents: treasuryState.bankBalanceCents,
          stablecoinBalanceCents: treasuryState.stablecoinBalanceCents,
          fundingFrozen: treasuryState.fundingFrozen,
        },
      },
    };
  }

  // Not a treasury route — return null so the caller falls through
  return null;
}
