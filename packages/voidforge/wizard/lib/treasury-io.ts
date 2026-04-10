/**
 * Treasury I/O — State persistence, WAL, transfers, funding plans.
 *
 * Extracts all file I/O and state management from treasury-heartbeat.ts
 * into a focused module. The mutable treasuryState lives here and is
 * accessible to jobs and handlers via getTreasuryState().
 *
 * PRD Reference: S10.4, S12, S13.2
 */

import { join } from 'node:path';
import { existsSync } from 'node:fs';
import { readFile, appendFile, mkdir, stat, rename } from 'node:fs/promises';

import { TREASURY_DIR, atomicWrite } from './financial-core.js';

// ── Types ────────────────────────────────────────────

/** Logger interface matching heartbeat's createLogger output. */
export interface Logger {
  log(message: string): void;
}

/** Callback to write current daemon state to heartbeat.json. */
export type WriteStateFn = () => Promise<void>;

/** Callback to trigger a freeze from circuit breaker. */
export type FreezeFn = (reason: string) => Promise<void>;

// ── Path Constants ───────────────────────────────────

/** Funding config marker — the encrypted config file in treasury dir. */
export const FUNDING_CONFIG_PATH = join(TREASURY_DIR, 'funding-config.json.enc');
export const FUNDING_PLANS_LOG = join(TREASURY_DIR, 'funding-plans.jsonl');
export const TRANSFERS_LOG = join(TREASURY_DIR, 'transfers.jsonl');
export const RECONCILIATION_LOG = join(TREASURY_DIR, 'reconciliation.jsonl');
export const PENDING_TRANSFERS_FILE = join(TREASURY_DIR, 'pending-transfers.json');
export const WAL_FILE = join(TREASURY_DIR, 'pending-ops.jsonl');
export const TREASURY_STATE_FILE = join(TREASURY_DIR, 'treasury-state.json');

// ── Stablecoin Treasury State ────────────────────────

export interface TreasuryHeartbeatState {
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
  /** Pending obligations from billing scans (invoices + expected debits). */
  pendingObligationsCents: number;
  /** Google invoice data from last scan. */
  googleInvoiceDueSoon: boolean;
  googleInvoiceCents: number;
  /** Meta debit data from last scan. */
  metaDebitFailed: boolean;
  metaPaymentRisk: boolean;
  metaForecast7DayCents: number;
}

export function defaultTreasuryState(): TreasuryHeartbeatState {
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
    pendingObligationsCents: 0,
    googleInvoiceDueSoon: false,
    googleInvoiceCents: 0,
    metaDebitFailed: false,
    metaPaymentRisk: false,
    metaForecast7DayCents: 0,
  };
}

// ── Shared Mutable State ─────────────────────────────

let treasuryState: TreasuryHeartbeatState = defaultTreasuryState();

/** Get a direct reference to the mutable treasury state. */
export function getTreasuryState(): TreasuryHeartbeatState {
  return treasuryState;
}

/** Replace the treasury state wholesale (used by loadTreasuryState). */
export function setTreasuryState(state: TreasuryHeartbeatState): void {
  treasuryState = state;
}

/** Get a snapshot (shallow clone) for external consumers. */
export function getTreasuryStateSnapshot(): TreasuryHeartbeatState {
  return { ...treasuryState };
}

// ── State File Persistence ───────────────────────────

export async function loadTreasuryState(): Promise<void> {
  try {
    if (existsSync(TREASURY_STATE_FILE)) {
      const raw = await readFile(TREASURY_STATE_FILE, 'utf-8');
      treasuryState = { ...defaultTreasuryState(), ...JSON.parse(raw) as Partial<TreasuryHeartbeatState> };
    }
  } catch {
    treasuryState = defaultTreasuryState();
  }
}

export async function saveTreasuryState(): Promise<void> {
  await mkdir(TREASURY_DIR, { recursive: true });
  await atomicWrite(TREASURY_STATE_FILE, JSON.stringify(treasuryState, null, 2));
}

// ── Configuration Check ──────────────────────────────

export function isStablecoinConfigured(): boolean {
  return existsSync(FUNDING_CONFIG_PATH);
}

// ── Pending Transfers Persistence ────────────────────

export interface PendingTransfer {
  id: string;
  fundingPlanId: string;
  providerTransferId: string;
  amountCents: number;
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';
  initiatedAt: string;
  lastPolledAt: string;
}

export async function readPendingTransfers(): Promise<PendingTransfer[]> {
  try {
    if (!existsSync(PENDING_TRANSFERS_FILE)) return [];
    const raw = await readFile(PENDING_TRANSFERS_FILE, 'utf-8');
    return JSON.parse(raw) as PendingTransfer[];
  } catch {
    return [];
  }
}

export async function writePendingTransfers(transfers: PendingTransfer[]): Promise<void> {
  await mkdir(TREASURY_DIR, { recursive: true });
  await atomicWrite(PENDING_TRANSFERS_FILE, JSON.stringify(transfers, null, 2));
}

// ── WAL Helpers ──────────────────────────────────────

export interface WalEntry {
  intentId: string;
  operation: string;
  params: unknown;
  status: 'pending' | 'completed' | 'failed';
  createdAt: string;
  completedAt?: string;
  error?: string;
}

const WAL_MAX_SIZE_BYTES = 10 * 1024 * 1024; // 10MB rotation threshold
const WAL_MAX_ROTATIONS = 7;

/** Rotate WAL file using 7-file rotation (same as audit-log pattern). */
export async function rotateWalIfNeeded(): Promise<void> {
  try {
    const stats = await stat(WAL_FILE);
    if (stats.size >= WAL_MAX_SIZE_BYTES) {
      for (let i = WAL_MAX_ROTATIONS - 1; i >= 1; i--) {
        try {
          await rename(WAL_FILE + '.' + i, WAL_FILE + '.' + (i + 1));
        } catch { /* file doesn't exist at this slot — skip */ }
      }
      await rename(WAL_FILE, WAL_FILE + '.1');
    }
  } catch {
    // File doesn't exist yet — that's fine
  }
}

export async function writeWalEntry(entry: WalEntry): Promise<void> {
  await mkdir(TREASURY_DIR, { recursive: true });
  await rotateWalIfNeeded();
  await appendFile(WAL_FILE, JSON.stringify(entry) + '\n', 'utf-8');
}

/** Read all pending WAL entries for recovery. */
export async function readPendingWalEntries(): Promise<WalEntry[]> {
  try {
    if (!existsSync(WAL_FILE)) return [];
    const content = await readFile(WAL_FILE, 'utf-8');
    const lines = content.trim().split('\n').filter(Boolean);
    const entries: WalEntry[] = [];
    for (const line of lines) {
      try {
        const entry = JSON.parse(line) as WalEntry;
        if (entry.status === 'pending') {
          entries.push(entry);
        }
      } catch { /* skip malformed */ }
    }
    return entries;
  } catch {
    return [];
  }
}

/** Complete a WAL entry by writing a completion record. */
export async function completeWalEntry(
  intentId: string,
  operation: string,
  result: 'completed' | 'failed',
  error?: string,
): Promise<void> {
  await writeWalEntry({
    intentId,
    operation,
    params: {},
    status: result,
    createdAt: new Date().toISOString(),
    completedAt: new Date().toISOString(),
    error,
  });
}

/** WAL recovery: check pending ops against adapter and resolve them. */
export async function recoverPendingOps(
  vaultKey: string | null,
  logger: Logger,
): Promise<void> {
  const pendingOps = await readPendingWalEntries();
  if (pendingOps.length === 0) return;

  logger.log(`WAL recovery: found ${pendingOps.length} pending operation(s)`);

  for (const op of pendingOps) {
    try {
      if (op.operation === 'offramp') {
        const params = op.params as { transferId?: string; providerTransferId?: string } | null;
        const providerTransferId = params?.providerTransferId;
        if (!providerTransferId) {
          // No provider transfer ID means the offramp never initiated — mark failed
          await completeWalEntry(op.intentId, op.operation, 'failed', 'No provider transfer ID — offramp never initiated');
          logger.log(`WAL recovery: ${op.intentId} marked failed (no provider transfer ID)`);
          continue;
        }

        const { getStablecoinAdapter } = await import('./financial/adapter-factory.js');
        const adapter = await getStablecoinAdapter(vaultKey, logger);
        const status = await adapter.getTransferStatus(providerTransferId);

        if (status.status === 'completed') {
          await completeWalEntry(op.intentId, op.operation, 'completed');
          logger.log(`WAL recovery: ${op.intentId} confirmed completed`);
        } else if (status.status === 'failed') {
          await completeWalEntry(op.intentId, op.operation, 'failed', 'Transfer failed at provider');
          logger.log(`WAL recovery: ${op.intentId} confirmed failed`);
        } else {
          logger.log(`WAL recovery: ${op.intentId} still ${status.status} — will retry next startup`);
        }
      } else if (op.operation === 'auto-funding-execute') {
        const params = op.params as { providerTransferId?: string } | null;
        const providerTransferId = params?.providerTransferId;
        if (!providerTransferId) {
          await completeWalEntry(op.intentId, op.operation, 'failed', 'No provider transfer ID');
          logger.log(`WAL recovery: ${op.intentId} marked failed (no provider transfer ID)`);
          continue;
        }

        const { getStablecoinAdapter } = await import('./financial/adapter-factory.js');
        const adapter = await getStablecoinAdapter(vaultKey, logger);
        const status = await adapter.getTransferStatus(providerTransferId);

        if (status.status === 'completed') {
          await completeWalEntry(op.intentId, op.operation, 'completed');
          logger.log(`WAL recovery: ${op.intentId} confirmed completed`);
        } else if (status.status === 'failed') {
          await completeWalEntry(op.intentId, op.operation, 'failed', 'Transfer failed at provider');
          logger.log(`WAL recovery: ${op.intentId} confirmed failed`);
        } else {
          logger.log(`WAL recovery: ${op.intentId} still ${status.status} — will retry next startup`);
        }
      } else {
        // Unknown op type — mark failed to avoid infinite recovery loop
        await completeWalEntry(op.intentId, op.operation, 'failed', `Unknown operation type: ${op.operation}`);
        logger.log(`WAL recovery: ${op.intentId} marked failed (unknown operation: ${op.operation})`);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      logger.log(`WAL recovery: ${op.intentId} check failed: ${msg}`);
    }
  }
}

// ── Funding Plan Persistence ─────────────────────────

export interface FundingPlanEntry {
  id: string;
  status: string;
  createdAt?: string;
  updatedAt?: string;
  requiredCents?: number;
  reason?: string;
  sourceFundingId?: string;
  destinationBankId?: string;
  idempotencyKey?: string;
  hash?: string;
  previousHash?: string;
  [key: string]: unknown;
}

/** Read all funding plans from the JSONL log. */
export async function readFundingPlans(): Promise<FundingPlanEntry[]> {
  try {
    if (!existsSync(FUNDING_PLANS_LOG)) return [];
    const content = await readFile(FUNDING_PLANS_LOG, 'utf-8');
    const lines = content.trim().split('\n').filter(Boolean);
    const plans: FundingPlanEntry[] = [];
    for (const line of lines) {
      try {
        plans.push(JSON.parse(line) as FundingPlanEntry);
      } catch { /* skip malformed */ }
    }
    return plans;
  } catch {
    return [];
  }
}

/** Rewrite the full funding plans log (after status transitions). */
export async function writeFundingPlans(plans: FundingPlanEntry[]): Promise<void> {
  await mkdir(TREASURY_DIR, { recursive: true });
  const content = plans.map(p => JSON.stringify(p)).join('\n') + '\n';
  await atomicWrite(FUNDING_PLANS_LOG, content);
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
