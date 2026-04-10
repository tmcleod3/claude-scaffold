/**
 * Treasury Jobs — scheduled heartbeat job definitions and auto-funding executor.
 *
 * Contains the 9 scheduled jobs registered with the daemon's JobScheduler
 * and the executeApprovedPlans function that initiates off-ramp transfers
 * for approved funding plans.
 *
 * PRD Reference: S10.4, S12, S15
 */

import { join } from 'node:path';
import { existsSync } from 'node:fs';
import { readFile, appendFile, mkdir } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';

import { TREASURY_DIR } from './financial-core.js';
import type { Cents } from './financial-core.js';

import { forecastRunway } from './financial/treasury-planner.js';
import type { CampaignSpendProjection } from './financial/treasury-planner.js';

import { evaluateAutoFunding } from './financial/funding-auto.js';
import type { AutoFundingConfig } from './financial/funding-auto.js';

import { reconcileThreeWay, shouldFreeze } from './financial/reconciliation-engine.js';
import type {
  ProviderTransfer, BankTransaction, PlatformSpendEntry,
} from './financial/reconciliation-engine.js';

import { createDailyBackup } from './treasury-backup.js';
import {
  planGoogleInvoiceSettlement,
  planMetaDebitProtection,
} from './financial/platform-planner.js';

import type { JobScheduler } from './daemon-core.js';

import {
  getTreasuryState,
  saveTreasuryState,
  loadTreasuryState,
  recoverPendingOps,
  isStablecoinConfigured,
  readPendingTransfers,
  writePendingTransfers,
  readFundingPlans,
  writeFundingPlans,
  writeWalEntry,
  FUNDING_PLANS_LOG,
  TRANSFERS_LOG,
  RECONCILIATION_LOG,
} from './treasury-io.js';
import type { Logger, WriteStateFn, FreezeFn } from './treasury-io.js';

import {
  evaluateCircuitBreakers,
  evaluateTransferSlaBreaker,
  evaluateBillingBreakers,
} from './treasury-circuit-breakers.js';

// ── Auto-Funding Plan Executor ───────────────────────

/** Execute approved funding plans: initiate offramp, track pending, write WAL. */
export async function executeApprovedPlans(
  vaultKey: string | null,
  logger: Logger,
  triggerFreeze: FreezeFn,
): Promise<void> {
  const plans = await readFundingPlans();
  const approvedPlans = plans.filter(p => p.status === 'APPROVED');

  if (approvedPlans.length === 0) return;

  logger.log(`Executing ${approvedPlans.length} approved funding plan(s)`);

  const { getStablecoinAdapter } = await import('./financial/adapter-factory.js');
  const adapter = await getStablecoinAdapter(vaultKey, logger);

  const treasuryState = getTreasuryState();

  for (const plan of approvedPlans) {
    const intentId = randomUUID();

    // Write WAL entry before execution (ADR-3)
    await writeWalEntry({
      intentId,
      operation: 'auto-funding-execute',
      params: { planId: plan.id, requiredCents: plan.requiredCents },
      status: 'pending',
      createdAt: new Date().toISOString(),
    });

    try {
      const planRef = {
        id: plan.id ?? randomUUID(),
        sourceFundingId: plan.sourceFundingId ?? 'default-source',
        destinationBankId: plan.destinationBankId ?? 'default-bank',
        requiredCents: (plan.requiredCents ?? 0) as Cents,
        idempotencyKey: plan.idempotencyKey ?? randomUUID(),
      };

      const transfer = await adapter.initiateOfframp(planRef, plan.hash ?? '');

      // Transition plan to PENDING_SETTLEMENT
      plan.status = 'PENDING_SETTLEMENT';
      plan.updatedAt = new Date().toISOString();
      await writeFundingPlans(plans);

      // Log the transfer
      await mkdir(TREASURY_DIR, { recursive: true });
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
      treasuryState.dailyMovementCents += (plan.requiredCents ?? 0) as number;

      // Complete WAL
      await writeWalEntry({
        intentId,
        operation: 'auto-funding-execute',
        params: { planId: plan.id, transferId: transfer.id, providerTransferId: transfer.providerTransferId },
        status: 'completed',
        createdAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
      });

      logger.log(
        `Auto-funding executed: plan ${plan.id}, ` +
        `$${(((plan.requiredCents ?? 0) as number) / 100).toFixed(2)} ` +
        `via ${transfer.provider} (transfer ${transfer.id})`,
      );

      // CB-6: Check daily movement limits
      const cb = evaluateCircuitBreakers(treasuryState);
      if (cb.shouldFreeze && !treasuryState.fundingFrozen) {
        await triggerFreeze(cb.reasons.join('; '));
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      logger.log(`Auto-funding execution failed for plan ${plan.id}: ${msg}`);

      // Mark plan as FAILED
      plan.status = 'FAILED';
      plan.updatedAt = new Date().toISOString();
      await writeFundingPlans(plans);

      // Mark WAL as failed
      await writeWalEntry({
        intentId,
        operation: 'auto-funding-execute',
        params: { planId: plan.id },
        status: 'failed',
        createdAt: new Date().toISOString(),
        error: msg,
      });
    }
  }

  await saveTreasuryState();
}

// ── Treasury Heartbeat Jobs (PRD S10.4) ──────────────

export function registerTreasuryJobs(
  scheduler: JobScheduler,
  logger: Logger,
  writeCurrentState: WriteStateFn,
  triggerFreeze: FreezeFn,
  vaultKey: string | null,
): void {
  if (!isStablecoinConfigured()) {
    logger.log('Treasury jobs skipped — stablecoin funding not configured');
    return;
  }

  // Load persisted treasury state on registration
  void loadTreasuryState().catch(() => {
    /* state will use defaults */
  });

  // WAL recovery: resolve pending operations from prior crash/restart
  void recoverPendingOps(vaultKey, logger).catch((err: unknown) => {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    logger.log(`WAL recovery failed: ${msg}`);
  });

  // Job 1: stablecoin-balance-check (hourly)
  scheduler.add('stablecoin-balance-check', 3_600_000, async () => {
    logger.log('Stablecoin balance check starting');
    const treasuryState = getTreasuryState();
    try {
      const { getStablecoinAdapter } = await import('./financial/adapter-factory.js');
      const adapter = await getStablecoinAdapter(vaultKey, logger);
      const balances = await adapter.getBalances();

      treasuryState.stablecoinBalanceCents = balances.totalStablecoinCents as number;
      treasuryState.consecutiveProviderFailures = 0;

      logger.log(
        `Stablecoin balance: $${((balances.totalStablecoinCents as number) / 100).toFixed(2)} ` +
        `(${balances.stablecoin.length} wallets)`,
      );

      await saveTreasuryState();
      await writeCurrentState();
    } catch (err: unknown) {
      treasuryState.consecutiveProviderFailures += 1;
      const msg = err instanceof Error ? err.message : 'Unknown error';
      logger.log(`Stablecoin balance check failed (${treasuryState.consecutiveProviderFailures} consecutive): ${msg}`);

      // CB-1: Provider unavailable for 3 consecutive polls
      const cb = evaluateCircuitBreakers(treasuryState);
      if (cb.shouldFreeze && !treasuryState.fundingFrozen) {
        await triggerFreeze(cb.reasons.join('; '));
      }
      await saveTreasuryState();
    }
  });

  // Job 2: offramp-status-poll (15 min)
  scheduler.add('offramp-status-poll', 900_000, async () => {
    const pending = await readPendingTransfers();
    const activePending = pending.filter(
      t => t.status === 'pending' || t.status === 'processing',
    );

    if (activePending.length === 0) return;

    logger.log(`Polling ${activePending.length} pending off-ramp transfers`);
    const treasuryState = getTreasuryState();

    try {
      const { getStablecoinAdapter } = await import('./financial/adapter-factory.js');
      const adapter = await getStablecoinAdapter(vaultKey, logger);
      let updated = false;

      for (const transfer of activePending) {
        try {
          const status = await adapter.getTransferStatus(transfer.providerTransferId);
          if (status.status !== transfer.status) {
            transfer.status = status.status;
            transfer.lastPolledAt = new Date().toISOString();
            updated = true;
            logger.log(
              `Transfer ${transfer.id} status: ${status.status} ` +
              `($${((status.amountCents as number) / 100).toFixed(2)})`,
            );

            if (status.status === 'completed') {
              treasuryState.pendingTransferCount = Math.max(0, treasuryState.pendingTransferCount - 1);

              // Mark matching funding plan as SETTLED
              if (transfer.fundingPlanId) {
                try {
                  const plans = await readFundingPlans();
                  const plan = plans.find(p => p.id === transfer.fundingPlanId);
                  if (plan && (plan.status === 'PENDING_SETTLEMENT' || plan.status === 'APPROVED')) {
                    plan.status = 'SETTLED';
                    plan.updatedAt = new Date().toISOString();
                    await writeFundingPlans(plans);
                    logger.log(`Funding plan ${plan.id} marked SETTLED`);
                  }
                } catch (planErr: unknown) {
                  const planMsg = planErr instanceof Error ? planErr.message : 'Unknown error';
                  logger.log(`Failed to update funding plan status: ${planMsg}`);
                }
              }
            }
          }
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : 'Unknown error';
          logger.log(`Transfer ${transfer.id} poll failed: ${msg}`);
        }
      }

      if (updated) {
        await writePendingTransfers(pending);
        await saveTreasuryState();
      }

      // CB-2: Check for SLA breach on pending transfers
      const slaCheck = evaluateTransferSlaBreaker(pending);
      if (slaCheck.shouldFreeze && !treasuryState.fundingFrozen) {
        await triggerFreeze(slaCheck.reasons.join('; '));
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      logger.log(`Off-ramp status poll error: ${msg}`);
    }
  });

  // Job 3: bank-settlement-monitor (hourly)
  scheduler.add('bank-settlement-monitor', 3_600_000, async () => {
    logger.log('Bank settlement monitor starting');
    const treasuryState = getTreasuryState();
    try {
      const { getBankAdapter } = await import('./financial/adapter-factory.js');
      const bankAdapter = await getBankAdapter(vaultKey, logger);

      if (!bankAdapter.getBalance) {
        logger.log('Bank adapter does not support getBalance — skipping');
        await writeCurrentState();
        return;
      }

      const balance = await bankAdapter.getBalance();
      treasuryState.bankBalanceCents = balance.available as number;
      logger.log(
        `Bank balance: $${((balance.available as number) / 100).toFixed(2)} available, ` +
        `$${((balance.pending as number) / 100).toFixed(2)} pending`,
      );

      // Check for newly settled transfers
      const pending = await readPendingTransfers();
      const recentlyCompleted = pending.filter(t => t.status === 'completed');

      if (recentlyCompleted.length > 0) {
        logger.log(`${recentlyCompleted.length} transfer(s) settled since last check`);
      }

      await saveTreasuryState();
      await writeCurrentState();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      logger.log(`Bank settlement monitor error: ${msg}`);
    }
  });

  // Job 4: google-invoice-scan (daily)
  scheduler.add('google-invoice-scan', 86_400_000, async () => {
    logger.log('Google invoice scan starting');
    const treasuryState = getTreasuryState();
    try {
      const { getBillingAdapter } = await import('./financial/adapter-factory.js');
      const billingAdapter = await getBillingAdapter('google', vaultKey, logger);
      if (!billingAdapter) {
        logger.log('Google invoice scan: no billing adapter available — skipping');
        await writeCurrentState();
        return;
      }

      const now = new Date();
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      const today = now.toISOString().slice(0, 10);
      const start = thirtyDaysAgo.toISOString().slice(0, 10);

      const invoices = await billingAdapter.readInvoices('google', { start, end: today });

      // Identify pending/overdue invoices for obligation tracking
      const pendingInvoices = invoices.filter(
        i => i.status === 'pending' || i.status === 'overdue',
      );
      const totalInvoiceCents = pendingInvoices.reduce(
        (sum, i) => sum + (i.amountCents as number), 0,
      );

      // Check for invoices due within 7 days
      const sevenDaysFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
      const dueSoon = pendingInvoices.some(i => {
        const dueDate = new Date(i.dueDate);
        return dueDate.getTime() <= sevenDaysFromNow.getTime();
      });

      // Update treasury state with invoice data
      treasuryState.googleInvoiceDueSoon = dueSoon;
      treasuryState.googleInvoiceCents = totalInvoiceCents;

      // Update pending obligations (add google invoices portion)
      // Recalculate: google invoices + meta debits
      treasuryState.pendingObligationsCents =
        totalInvoiceCents + treasuryState.metaForecast7DayCents;

      logger.log(
        `Google invoice scan: ${invoices.length} invoice(s), ` +
        `${pendingInvoices.length} pending/overdue ` +
        `($${(totalInvoiceCents / 100).toFixed(2)}), ` +
        `due soon: ${dueSoon}`,
      );

      // Settlement planning: prioritize overdue invoices, then nearest due date
      if (pendingInvoices.length > 0) {
        const plans = planGoogleInvoiceSettlement(
          pendingInvoices.map(i => ({
            invoiceId: i.id,
            amountCents: i.amountCents as Cents,
            dueDate: i.dueDate,
            status: i.status as 'pending' | 'overdue',
          })),
          treasuryState.bankBalanceCents as Cents,
          50_000 as Cents, // $500 buffer
        );
        logger.log(`Settlement plans: ${plans.length} invoices prioritized for payment`);
      }

      // CB-4: Evaluate billing breakers with invoice data
      const cbResult = evaluateBillingBreakers({
        googleInvoiceDueSoon: dueSoon,
        googleInvoiceCents: totalInvoiceCents,
        bankBalanceCents: treasuryState.bankBalanceCents,
        minimumBufferCents: 50_000, // $500 minimum buffer
        metaDebitFailed: treasuryState.metaDebitFailed,
        metaPaymentRisk: treasuryState.metaPaymentRisk,
      });

      if (cbResult.shouldFreeze && !treasuryState.fundingFrozen) {
        await triggerFreeze(cbResult.reasons.join('; '));
      }

      await saveTreasuryState();
      await writeCurrentState();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      logger.log(`Google invoice scan error: ${msg}`);
    }
  });

  // Job 5: meta-debit-monitor (daily)
  scheduler.add('meta-debit-monitor', 86_400_000, async () => {
    logger.log('Meta debit monitor starting');
    const treasuryState = getTreasuryState();
    try {
      const { getBillingAdapter } = await import('./financial/adapter-factory.js');
      const billingAdapter = await getBillingAdapter('meta', vaultKey, logger);
      if (!billingAdapter) {
        logger.log('Meta debit monitor: no billing adapter available — skipping');
        await writeCurrentState();
        return;
      }

      const now = new Date();
      const today = now.toISOString().slice(0, 10);
      const sevenDaysFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
      const end = sevenDaysFromNow.toISOString().slice(0, 10);

      let debits: Awaited<ReturnType<typeof billingAdapter.readExpectedDebits>> = [];
      let metaDebitFailed = false;
      try {
        debits = await billingAdapter.readExpectedDebits('meta', { start: today, end });
      } catch (debitErr: unknown) {
        // If we can't read debits, Meta may be in a bad state
        metaDebitFailed = true;
        const msg = debitErr instanceof Error ? debitErr.message : 'Unknown error';
        logger.log(`Meta debit read failed: ${msg}`);
        debits = [];
      }

      // Sum expected debits for obligation tracking
      const totalDebitCents = debits.reduce(
        (sum, d) => sum + (d.estimatedAmountCents as number), 0,
      );

      // Check for failed or risky debits
      const hasFailedDebit = debits.some(d => d.status === 'failed');
      // Meta "payment risk" = debit failed or adapter call failed
      const paymentRisk = metaDebitFailed || hasFailedDebit;

      // Update treasury state with debit data
      treasuryState.metaDebitFailed = metaDebitFailed || hasFailedDebit;
      treasuryState.metaPaymentRisk = paymentRisk;
      treasuryState.metaForecast7DayCents = totalDebitCents;

      // Update pending obligations (google invoices + meta debits)
      treasuryState.pendingObligationsCents =
        treasuryState.googleInvoiceCents + totalDebitCents;

      logger.log(
        `Meta debit monitor: ${debits.length} expected debit(s) ` +
        `($${(totalDebitCents / 100).toFixed(2)} next 7 days), ` +
        `failed: ${hasFailedDebit}, risk: ${paymentRisk}`,
      );

      // Debit protection: calculate additional buffer needed for upcoming Meta debits
      if (debits.length > 0) {
        const additionalBuffer = planMetaDebitProtection(
          debits.map(d => ({
            date: d.expectedDate,
            amountCents: d.estimatedAmountCents as Cents,
          })),
          treasuryState.bankBalanceCents as Cents,
          50_000 as Cents, // $500 buffer
        );
        if ((additionalBuffer as number) > 0) {
          logger.log(`Meta debit protection: additional buffer needed $${((additionalBuffer as number) / 100).toFixed(2)}`);
        }
      }

      // CB-5: Evaluate billing breakers with debit data
      const cbResult = evaluateBillingBreakers({
        googleInvoiceDueSoon: treasuryState.googleInvoiceDueSoon,
        googleInvoiceCents: treasuryState.googleInvoiceCents,
        bankBalanceCents: treasuryState.bankBalanceCents,
        minimumBufferCents: 50_000, // $500 minimum buffer
        metaDebitFailed: treasuryState.metaDebitFailed,
        metaPaymentRisk: paymentRisk,
      });

      if (cbResult.shouldFreeze && !treasuryState.fundingFrozen) {
        await triggerFreeze(cbResult.reasons.join('; '));
      }

      await saveTreasuryState();
      await writeCurrentState();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      logger.log(`Meta debit monitor error: ${msg}`);
    }
  });

  // Job 6: runway-forecast (every 6 hours)
  scheduler.add('runway-forecast', 21_600_000, async () => {
    logger.log('Runway forecast starting');
    const treasuryState = getTreasuryState();
    try {
      // Read campaign data for spend projection
      const campaignsDir = join(TREASURY_DIR, 'campaigns');
      const campaigns: CampaignSpendProjection[] = [];

      if (existsSync(campaignsDir)) {
        const { readdir } = await import('node:fs/promises');
        const files = await readdir(campaignsDir);
        for (const file of files) {
          if (!file.endsWith('.json')) continue;
          try {
            const content = await readFile(join(campaignsDir, file), 'utf-8');
            const c = JSON.parse(content) as Record<string, unknown>;
            campaigns.push({
              campaignId: (c.id as string) ?? file,
              platform: (c.platform as 'google' | 'meta') ?? 'google',
              dailyBudgetCents: (c.dailyBudgetCents as Cents) ?? (0 as Cents),
              status: (c.status as 'active' | 'paused') ?? 'paused',
            });
          } catch { /* skip malformed */ }
        }
      }

      const bankBalance = treasuryState.bankBalanceCents as Cents;
      const pendingObligations = treasuryState.pendingObligationsCents as Cents;

      const forecast = forecastRunway(bankBalance, campaigns, pendingObligations);
      treasuryState.runwayDays = forecast.runwayDays;

      logger.log(
        `Runway forecast: ${forecast.runwayDays} days ` +
        `(bank $${(bankBalance / 100).toFixed(2)}, ` +
        `daily spend $${((forecast.dailySpendCents as number) / 100).toFixed(2)})`,
      );

      // Auto-funding evaluation: if runway is low, check if we should auto-off-ramp
      if (!treasuryState.fundingFrozen) {
        const autoConfig: AutoFundingConfig = {
          source: {
            id: 'default-source',
            provider: 'circle',
            asset: 'USDC',
            network: 'ETH',
            sourceAccountId: 'default',
            whitelistedDestinationBankId: 'default-bank',
            status: 'active',
          },
          bank: {
            id: 'default-bank',
            provider: 'mercury',
            accountId: 'default',
            currency: 'USD',
            availableBalanceCents: bankBalance,
            reservedBalanceCents: 0 as Cents,
            minimumBufferCents: 50_000 as Cents, // $500
          },
          planConfig: {
            minimumOfframpCents: 10_000 as Cents, // $100
            bufferTargetCents: 100_000 as Cents, // $1,000
            maxDailyOfframpCents: 5_000_000 as Cents, // $50,000
            targetRunwayDays: 30,
          },
          pendingSpendCents: pendingObligations,
          obligations: [],
          googleInvoiceDueSoon: treasuryState.googleInvoiceDueSoon,
          googleInvoiceCents: treasuryState.googleInvoiceCents as Cents,
          metaUsesDirectDebit: treasuryState.metaForecast7DayCents > 0,
          metaForecast7DayCents: treasuryState.metaForecast7DayCents as Cents,
          debitProtectionBufferCents: 0 as Cents,
          discrepancyExists: treasuryState.consecutiveMismatches > 0,
          previousHash: '',
        };

        const autoResult = evaluateAutoFunding(autoConfig);

        if (autoResult) {
          logger.log(
            `Auto-funding approved: $${((autoResult.plan.requiredCents as number) / 100).toFixed(2)} ` +
            `(reason: ${autoResult.plan.reason}) — queuing for execution`,
          );
          // Log the approved plan
          await mkdir(TREASURY_DIR, { recursive: true });
          await appendFile(
            FUNDING_PLANS_LOG,
            JSON.stringify(autoResult.plan) + '\n',
            'utf-8',
          );
        } else {
          logger.log('Auto-funding: no action needed or policy blocked');
        }

        // Execute approved funding plans
        await executeApprovedPlans(vaultKey, logger, triggerFreeze);
      }

      await saveTreasuryState();
      await writeCurrentState();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      logger.log(`Runway forecast error: ${msg}`);
    }
  });

  // Job 7: funding-reconciliation (extends existing reconciliation at midnight+06:00)
  scheduler.add('funding-reconciliation', 3_600_000, async () => {
    const hour = new Date().getUTCHours();
    if (hour !== 0 && hour !== 6) return;

    logger.log(`Funding reconciliation (${hour === 0 ? 'preliminary' : 'authoritative'}) starting`);
    const treasuryState = getTreasuryState();
    try {
      // Read provider transfers from transfers log
      const providerTransfers: ProviderTransfer[] = [];
      if (existsSync(TRANSFERS_LOG)) {
        const content = await readFile(TRANSFERS_LOG, 'utf-8');
        const lines = content.trim().split('\n').filter(Boolean);
        for (const line of lines) {
          try {
            const t = JSON.parse(line) as ProviderTransfer;
            providerTransfers.push(t);
          } catch { /* skip malformed */ }
        }
      }

      // Bank transactions and platform spend are empty until bank adapter
      // is wired with real credentials
      const bankTransactions: BankTransaction[] = [];
      const platformSpend: PlatformSpendEntry[] = [];

      const report = reconcileThreeWay(
        providerTransfers,
        bankTransactions,
        platformSpend,
      );

      // Write report to reconciliation log
      await mkdir(TREASURY_DIR, { recursive: true });
      await appendFile(
        RECONCILIATION_LOG,
        JSON.stringify({ ...report, type: hour === 0 ? 'preliminary' : 'authoritative' }) + '\n',
        'utf-8',
      );

      treasuryState.lastReconciliationAt = new Date().toISOString();

      // Track consecutive mismatches for CB-3
      if (report.mismatchCount > 0) {
        treasuryState.consecutiveMismatches += 1;
        logger.log(
          `Reconciliation: ${report.mismatchCount} mismatch(es), ` +
          `${treasuryState.consecutiveMismatches} consecutive`,
        );
      } else {
        treasuryState.consecutiveMismatches = 0;
        logger.log(
          `Reconciliation: clean — ${report.transferMatches.length} transfers matched, ` +
          `variance $${((report.overallVarianceCents as number) / 100).toFixed(2)}`,
        );
      }

      // CB-3: Reconciliation mismatch for 2 consecutive closes
      if (shouldFreeze(report.mismatchCount, treasuryState.consecutiveMismatches, 2)) {
        if (!treasuryState.fundingFrozen) {
          await triggerFreeze(
            `Reconciliation mismatch for ${treasuryState.consecutiveMismatches} consecutive closes`,
          );
        }
      }

      await saveTreasuryState();
      await writeCurrentState();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      logger.log(`Funding reconciliation error: ${msg}`);
    }
  });

  // Job 8: stale-plan-detector (hourly)
  scheduler.add('stale-plan-detector', 3_600_000, async () => {
    try {
      if (!existsSync(FUNDING_PLANS_LOG)) return;

      const content = await readFile(FUNDING_PLANS_LOG, 'utf-8');
      const lines = content.trim().split('\n').filter(Boolean);
      const STALE_THRESHOLD_MS = 24 * 60 * 60 * 1000; // 24 hours
      const now = Date.now();
      let staleCount = 0;

      for (const line of lines) {
        try {
          const plan = JSON.parse(line) as {
            id?: string;
            status?: string;
            createdAt?: string;
          };
          if (plan.status !== 'DRAFT' && plan.status !== 'APPROVED') continue;

          const age = now - new Date(plan.createdAt ?? '').getTime();
          if (age > STALE_THRESHOLD_MS) {
            staleCount += 1;
            logger.log(`Stale funding plan: ${plan.id} (${plan.status}, ${Math.round(age / (60 * 60 * 1000))}h old)`);
          }
        } catch { /* skip malformed */ }
      }

      if (staleCount > 0) {
        logger.log(`${staleCount} stale funding plan(s) detected — plans stuck in PENDING >24h`);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      logger.log(`Stale plan detector error: ${msg}`);
    }
  });

  // Job 9: treasury-backup (daily — encrypted AES-256-GCM snapshots, 30-day retention)
  scheduler.add('treasury-backup', 86_400_000, async () => {
    logger.log('Treasury backup starting');
    try {
      const result = await createDailyBackup(vaultKey ?? '');
      logger.log(`Treasury backup: ${result.files} files backed up to ${result.path}`);
      await writeCurrentState();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      logger.log(`Treasury backup error: ${msg}`);
    }
  });

  logger.log('Treasury heartbeat jobs registered (9 jobs, WAL recovery active)');
}
