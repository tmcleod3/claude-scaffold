/**
 * Treasury Heartbeat — heartbeat jobs, socket handlers, and circuit breakers
 * for stablecoin funding operations.
 *
 * Wires the pure-logic modules (treasury-planner, funding-policy, reconciliation-engine)
 * into the heartbeat daemon's job scheduler and socket API.
 *
 * Only activates when stablecoin funding is configured (funding-config.json.enc exists).
 *
 * PRD Reference: S10.4, S12, S13.2, S15, S16
 * Agents: Dockson (treasury), Heartbeat daemon
 */

import { join } from 'node:path';
import { existsSync } from 'node:fs';
import { readFile, appendFile, mkdir } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';

import { TREASURY_DIR, appendToLog, atomicWrite } from './financial-core.js';
import type { Cents } from './financial-core.js';

import {
  calculateRunway, forecastRunway, generateFundingPlan,
  calculateDailySpendRate,
} from './financial/treasury-planner.js';
import type {
  CampaignSpendProjection, FundingPlanConfig, ObligationInput,
} from './financial/treasury-planner.js';

import { evaluatePolicy, aggregateDecisions } from './financial/funding-policy.js';
import type { TreasuryState, PolicyDecision } from './financial/funding-policy.js';

import { evaluateAutoFunding } from './financial/funding-auto.js';
import type { AutoFundingConfig } from './financial/funding-auto.js';

import { reconcileThreeWay, shouldFreeze } from './financial/reconciliation-engine.js';
import type {
  ProviderTransfer, BankTransaction, PlatformSpendEntry,
  ReconciliationReport as ThreeWayReport,
} from './financial/reconciliation-engine.js';

import type { JobScheduler } from './daemon-core.js';

// ── Types ────────────────────────────────────────────

/** Funding config marker — the encrypted config file in treasury dir. */
const FUNDING_CONFIG_PATH = join(TREASURY_DIR, 'funding-config.json.enc');
const FUNDING_PLANS_LOG = join(TREASURY_DIR, 'funding-plans.jsonl');
const TRANSFERS_LOG = join(TREASURY_DIR, 'transfers.jsonl');
const RECONCILIATION_LOG = join(TREASURY_DIR, 'reconciliation.jsonl');
const PENDING_TRANSFERS_FILE = join(TREASURY_DIR, 'pending-transfers.json');

/** Logger interface matching heartbeat's createLogger output. */
interface Logger {
  log(message: string): void;
}

/** Callback to write current daemon state to heartbeat.json. */
type WriteStateFn = () => Promise<void>;

/** Callback to trigger a freeze from circuit breaker. */
type FreezeFn = (reason: string) => Promise<void>;

// ── Stablecoin Treasury State ────────────────────────

interface TreasuryHeartbeatState {
  stablecoinBalanceCents: number;
  bankBalanceCents: number;
  pendingTransferCount: number;
  lastOfframpAt: string | null;
  lastReconciliationAt: string | null;
  runwayDays: number;
  fundingFrozen: boolean;
  freezeReason: string | null;
  consecutiveMismatches: number;
  consecutiveProviderFailures: number;
  lastCircuitBreakerCheck: string | null;
  dailyMovementCents: number;
  dailyMovementDate: string;
}

function defaultTreasuryState(): TreasuryHeartbeatState {
  return {
    stablecoinBalanceCents: 0,
    bankBalanceCents: 0,
    pendingTransferCount: 0,
    lastOfframpAt: null,
    lastReconciliationAt: null,
    runwayDays: 0,
    fundingFrozen: false,
    freezeReason: null,
    consecutiveMismatches: 0,
    consecutiveProviderFailures: 0,
    lastCircuitBreakerCheck: null,
    dailyMovementCents: 0,
    dailyMovementDate: new Date().toISOString().slice(0, 10),
  };
}

// ── State File Persistence ───────────────────────────

const TREASURY_STATE_FILE = join(TREASURY_DIR, 'treasury-state.json');

let treasuryState: TreasuryHeartbeatState = defaultTreasuryState();

async function loadTreasuryState(): Promise<void> {
  try {
    if (existsSync(TREASURY_STATE_FILE)) {
      const raw = await readFile(TREASURY_STATE_FILE, 'utf-8');
      treasuryState = { ...defaultTreasuryState(), ...JSON.parse(raw) as Partial<TreasuryHeartbeatState> };
    }
  } catch {
    treasuryState = defaultTreasuryState();
  }
}

async function saveTreasuryState(): Promise<void> {
  await mkdir(TREASURY_DIR, { recursive: true });
  await atomicWrite(TREASURY_STATE_FILE, JSON.stringify(treasuryState, null, 2));
}

// ── Configuration Check ──────────────────────────────

export function isStablecoinConfigured(): boolean {
  return existsSync(FUNDING_CONFIG_PATH);
}

// ── Pending Transfers Persistence ────────────────────

interface PendingTransfer {
  id: string;
  fundingPlanId: string;
  providerTransferId: string;
  amountCents: number;
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';
  initiatedAt: string;
  lastPolledAt: string;
}

async function readPendingTransfers(): Promise<PendingTransfer[]> {
  try {
    if (!existsSync(PENDING_TRANSFERS_FILE)) return [];
    const raw = await readFile(PENDING_TRANSFERS_FILE, 'utf-8');
    return JSON.parse(raw) as PendingTransfer[];
  } catch {
    return [];
  }
}

async function writePendingTransfers(transfers: PendingTransfer[]): Promise<void> {
  await mkdir(TREASURY_DIR, { recursive: true });
  await atomicWrite(PENDING_TRANSFERS_FILE, JSON.stringify(transfers, null, 2));
}

// ── WAL Helpers ──────────────────────────────────────

interface WalEntry {
  intentId: string;
  operation: string;
  params: unknown;
  status: 'pending' | 'completed' | 'failed';
  createdAt: string;
  completedAt?: string;
  error?: string;
}

async function writeWalEntry(entry: WalEntry): Promise<void> {
  const walFile = join(TREASURY_DIR, 'pending-ops.jsonl');
  await mkdir(TREASURY_DIR, { recursive: true });
  await appendFile(walFile, JSON.stringify(entry) + '\n', 'utf-8');
}

// ── Circuit Breaker Conditions (PRD S13.2) ───────────

interface CircuitBreakerResult {
  shouldFreeze: boolean;
  reasons: string[];
}

export function evaluateCircuitBreakers(state: TreasuryHeartbeatState): CircuitBreakerResult {
  const reasons: string[] = [];

  // CB-1: Provider unavailable for 3 consecutive polls
  if (state.consecutiveProviderFailures >= 3) {
    reasons.push(
      `Stablecoin provider unavailable for ${state.consecutiveProviderFailures} consecutive polls — freeze funding`,
    );
  }

  // CB-2: Off-ramp pending beyond SLA window (24 hours)
  // Checked via pending transfers — caller handles this with transfer data

  // CB-3: Reconciliation mismatch for 2 consecutive closes
  if (state.consecutiveMismatches >= 2) {
    reasons.push(
      `Reconciliation mismatch for ${state.consecutiveMismatches} consecutive closes — freeze funding`,
    );
  }

  // CB-6: Max daily treasury movement exceeded ($50,000 default)
  const MAX_DAILY_MOVEMENT_CENTS = 5_000_000 as Cents; // $50,000
  if ((state.dailyMovementCents as Cents) > MAX_DAILY_MOVEMENT_CENTS) {
    reasons.push(
      `Daily treasury movement $${(state.dailyMovementCents / 100).toFixed(2)} exceeds max $${(MAX_DAILY_MOVEMENT_CENTS / 100).toFixed(2)} — freeze funding`,
    );
  }

  return {
    shouldFreeze: reasons.length > 0,
    reasons,
  };
}

/** Evaluate CB-2 specifically for pending transfers beyond SLA. */
export function evaluateTransferSlaBreaker(
  transfers: PendingTransfer[],
  slaHours: number = 24,
): CircuitBreakerResult {
  const reasons: string[] = [];
  const slaMs = slaHours * 60 * 60 * 1000;
  const now = Date.now();

  for (const t of transfers) {
    if (t.status !== 'pending' && t.status !== 'processing') continue;
    const age = now - new Date(t.initiatedAt).getTime();
    if (age > slaMs) {
      reasons.push(
        `Transfer ${t.id} pending for ${Math.round(age / (60 * 60 * 1000))}h — exceeds ${slaHours}h SLA — freeze funding`,
      );
    }
  }

  return {
    shouldFreeze: reasons.length > 0,
    reasons,
  };
}

/** Evaluate CB-4 and CB-5 from billing adapter state. */
export function evaluateBillingBreakers(opts: {
  googleInvoiceDueSoon: boolean;
  googleInvoiceCents: number;
  bankBalanceCents: number;
  minimumBufferCents: number;
  metaDebitFailed: boolean;
  metaPaymentRisk: boolean;
}): CircuitBreakerResult {
  const reasons: string[] = [];

  // CB-4: Google invoice due soon + insufficient fiat
  if (opts.googleInvoiceDueSoon) {
    const availableForInvoice = opts.bankBalanceCents - opts.minimumBufferCents;
    if (availableForInvoice < opts.googleInvoiceCents) {
      reasons.push(
        `Google invoice $${(opts.googleInvoiceCents / 100).toFixed(2)} due soon but only ` +
        `$${(availableForInvoice / 100).toFixed(2)} available — freeze non-essential funding`,
      );
    }
  }

  // CB-5: Meta debit fails or payment-risk state
  if (opts.metaDebitFailed) {
    reasons.push('Meta direct debit failed — freeze funding until bank balance confirmed');
  }
  if (opts.metaPaymentRisk) {
    reasons.push('Meta account in payment-risk state — freeze funding');
  }

  return {
    shouldFreeze: reasons.length > 0,
    reasons,
  };
}

// ── Treasury Heartbeat Jobs (PRD S10.4) ──────────────

export function registerTreasuryJobs(
  scheduler: JobScheduler,
  logger: Logger,
  writeCurrentState: WriteStateFn,
  triggerFreeze: FreezeFn,
): void {
  if (!isStablecoinConfigured()) {
    logger.log('Treasury jobs skipped — stablecoin funding not configured');
    return;
  }

  // Load persisted treasury state on registration
  void loadTreasuryState().catch(() => {
    /* state will use defaults */
  });

  // Job 1: stablecoin-balance-check (hourly)
  scheduler.add('stablecoin-balance-check', 3_600_000, async () => {
    logger.log('Stablecoin balance check starting');
    try {
      const { SandboxStablecoinAdapter } = await import('./financial/stablecoin/sandbox-stablecoin.js');
      const adapter = new SandboxStablecoinAdapter();
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

    try {
      const { SandboxStablecoinAdapter } = await import('./financial/stablecoin/sandbox-stablecoin.js');
      const adapter = new SandboxStablecoinAdapter();
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
    try {
      // Read bank balance from Mercury adapter (or sandbox)
      // In production, this would use MercuryBankAdapter.getBalance()
      // For now, read from treasury state (updated by external reconciliation or manual entry)
      const bankBalance = treasuryState.bankBalanceCents;
      logger.log(`Bank balance: $${(bankBalance / 100).toFixed(2)}`);

      // Check for newly settled transfers
      const pending = await readPendingTransfers();
      const recentlyCompleted = pending.filter(t => t.status === 'completed');

      if (recentlyCompleted.length > 0) {
        logger.log(`${recentlyCompleted.length} transfer(s) settled since last check`);
      }

      await writeCurrentState();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      logger.log(`Bank settlement monitor error: ${msg}`);
    }
  });

  // Job 4: google-invoice-scan (daily)
  scheduler.add('google-invoice-scan', 86_400_000, async () => {
    logger.log('Google invoice scan starting');
    try {
      const { GoogleBillingAdapter } = await import('./financial/billing/google-billing.js');
      // In production, config comes from encrypted vault
      // For now, log that the scan was attempted
      logger.log('Google invoice scan: adapter loaded — requires credentials from vault');

      // When credentials are available:
      // const adapter = new GoogleBillingAdapter(config);
      // const invoices = await adapter.readInvoices('google', dateRange);
      // Log pending/overdue invoices and update treasury state

      await writeCurrentState();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      logger.log(`Google invoice scan error: ${msg}`);
    }
  });

  // Job 5: meta-debit-monitor (daily)
  scheduler.add('meta-debit-monitor', 86_400_000, async () => {
    logger.log('Meta debit monitor starting');
    try {
      const { MetaBillingAdapter } = await import('./financial/billing/meta-billing.js');
      // In production, config comes from encrypted vault
      logger.log('Meta debit monitor: adapter loaded — requires credentials from vault');

      // When credentials are available:
      // const adapter = new MetaBillingAdapter(config);
      // const debits = await adapter.readExpectedDebits('meta', dateRange);
      // Log expected debits and update treasury state

      await writeCurrentState();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      logger.log(`Meta debit monitor error: ${msg}`);
    }
  });

  // Job 6: runway-forecast (every 6 hours)
  scheduler.add('runway-forecast', 21_600_000, async () => {
    logger.log('Runway forecast starting');
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
      const pendingObligations = 0 as Cents; // TODO: sum from invoice/debit scans

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
          googleInvoiceDueSoon: false,
          googleInvoiceCents: 0 as Cents,
          metaUsesDirectDebit: false,
          metaForecast7DayCents: 0 as Cents,
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
          // Log the approved plan for the offramp-status-poll job to pick up
          await mkdir(TREASURY_DIR, { recursive: true });
          await appendFile(
            FUNDING_PLANS_LOG,
            JSON.stringify(autoResult.plan) + '\n',
            'utf-8',
          );
        } else {
          logger.log('Auto-funding: no action needed or policy blocked');
        }
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

  logger.log('Treasury heartbeat jobs registered (8 jobs)');
}

// ── Treasury Socket Handlers ─────────────────────────

export async function handleTreasuryRequest(
  method: string,
  path: string,
  _body: unknown,
  auth: { vaultVerified: boolean; totpVerified: boolean },
  logger: Logger,
  triggerFreeze: FreezeFn,
): Promise<{ status: number; body: unknown } | null> {

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
      const { SandboxStablecoinAdapter } = await import('./financial/stablecoin/sandbox-stablecoin.js');
      const adapter = new SandboxStablecoinAdapter();

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

// ── Freeze Helper for Circuit Breakers ───────────────

export async function executeTreasuryFreeze(
  reason: string,
  logger: Logger,
): Promise<void> {
  treasuryState.fundingFrozen = true;
  treasuryState.freezeReason = reason;
  logger.log(`TREASURY FREEZE: ${reason}`);
  await saveTreasuryState();
}

// ── Exported State Accessors (for heartbeat state snapshot) ──

export function getTreasuryStateSnapshot(): TreasuryHeartbeatState {
  return { ...treasuryState };
}

export type {
  TreasuryHeartbeatState,
  CircuitBreakerResult,
  PendingTransfer,
  Logger,
  WriteStateFn,
  FreezeFn,
};
