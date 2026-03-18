/**
 * Pattern: Financial Transaction (Branded Types + Hash-Chained Append Log)
 *
 * Key principles:
 * - All money in integer cents (Cents branded type) — NEVER floating point
 * - Append-only immutable logs — never rewrite, only append
 * - Hash chain for tamper detection (SHA-256 of previous entry)
 * - Atomic writes (write-to-temp + fsync + rename) per ADR-1
 * - macOS: use F_FULLFSYNC instead of fsync for financial files (§9.18)
 * - Single-writer architecture — only the heartbeat daemon writes financial state
 *
 * Agents: Dockson (treasury), Steris (budget), Vin (analytics)
 *
 * PRD Reference: §9.9, §9.17 (branded types), §9.18 (macOS fsync), ADR-1/ADR-3
 */

import { createHash } from 'node:crypto';
import { writeFile, appendFile, open, rename, unlink } from 'node:fs/promises';
import { constants } from 'node:fs';
import { join } from 'node:path';
import { homedir, platform } from 'node:os';

// ── Branded Financial Types (§9.17) ───────────────────
// These prevent mixing dollars and cents at the type level.

type Cents = number & { readonly __brand: 'Cents' };
type Percentage = number & { readonly __brand: 'Percentage' };  // 0-100
type Ratio = number & { readonly __brand: 'Ratio' };            // e.g., 3.68

type AdPlatform = 'meta' | 'google' | 'tiktok' | 'linkedin' | 'twitter' | 'reddit';
type RevenueSource = 'stripe' | 'paddle';
type BankSource = 'mercury' | 'brex';
type TransactionSource = AdPlatform | RevenueSource | BankSource;

function toCents(dollars: number): Cents {
  return Math.round(dollars * 100) as Cents;
}

function toDollars(cents: Cents): number {
  return cents / 100;
}

// ── Transaction Record (§9.9) ─────────────────────────

interface Transaction {
  id: string;                    // UUID v4
  projectId: string;
  type: 'revenue' | 'spend' | 'refund';
  source: TransactionSource;
  externalId: string;            // platform's transaction ID
  amount: Cents;                 // integer cents, never float
  currency: 'USD';              // USD-only per ADR-6
  description: string;
  metadata: Record<string, string>;
  createdAt: string;             // ISO 8601
  reconciledAt?: string;
  reconciledStatus?: 'matched' | 'discrepancy' | 'pending';
}

// ── Budget Record (§9.9) ──────────────────────────────

interface Budget {
  id: string;
  projectId: string;
  period: 'daily' | 'weekly' | 'monthly';
  totalAmount: Cents;
  currency: 'USD';
  allocations: Array<{
    platform: AdPlatform;
    amount: Cents;
    dailyCap: Cents;             // enforced on platform side
  }>;
  safetyTiers: {
    autoApproveBelow: Cents;     // default 2500 ($25/day)
    agentApproveBelow: Cents;    // default 10000 ($100/day)
    humanConfirmBelow: Cents;    // default 50000 ($500/day)
    hardStopAbove: Cents;        // default 50000 ($500/day)
  };
  createdAt: string;
  updatedAt: string;
}

// ── Campaign Record (§9.9 + §9.17 + §9.20.3) ─────────

type CampaignStatus =
  | 'draft'
  | 'pending_approval'
  | 'creating'
  | 'active'
  | 'paused'
  | 'completed'
  | 'error'
  | 'suspended'
  | 'deleting'
  | 'freeze_pending';

type CampaignEventSource = 'cli' | 'daemon' | 'platform' | 'agent';

interface CampaignStateEvent {
  timestamp: string;
  source: CampaignEventSource;
  oldStatus: CampaignStatus;
  newStatus: CampaignStatus;
  reason: string;
  ruleId?: string;               // for agent-initiated: which Tier 1 rule triggered
}

interface GrowthCampaign {
  id: string;
  projectId: string;
  platform: AdPlatform;
  externalId: string;
  name: string;
  status: CampaignStatus;
  dailyBudget: Cents;
  totalSpend: Cents;
  metrics: {
    impressions: number;
    clicks: number;
    conversions: number;
    ctr: Percentage;
    cpc: Cents;
    roas: Ratio;
  };
  testGroupId?: string;          // A/B test group link (§9.20.3)
  testVariant?: string;          // 'A' | 'B' | 'C' etc.
  testMetric?: 'ctr' | 'roas' | 'conversions';
  events: CampaignStateEvent[];  // event-sourced state transitions
  createdAt: string;
  updatedAt: string;
  pausedAt?: string;
  pauseReason?: string;
}

// ── Revenue Event (§9.9) ──────────────────────────────

interface RevenueEvent {
  id: string;
  projectId: string;
  source: RevenueSource;
  type: 'charge' | 'subscription' | 'refund' | 'dispute';
  amount: Cents;                 // negative for refunds/disputes
  currency: 'USD';
  customerId?: string;           // hashed — never store raw email
  subscriptionId?: string;
  metadata: Record<string, string>;
  createdAt: string;
}

// ── Reconciliation Record (§9.9 + §9.17) ──────────────

interface ReconciliationReport {
  id: string;                    // UUID v4
  date: string;                  // YYYY-MM-DD
  type: 'preliminary' | 'final';
  projectId: string;
  spend: Array<{
    platform: AdPlatform;
    voidforgeRecorded: Cents;
    platformReported: Cents;
    discrepancy: Cents;          // absolute difference
    status: 'matched' | 'discrepancy' | 'unavailable';
  }>;
  revenue: Array<{
    source: RevenueSource;
    recorded: Cents;
    reported: Cents;
    discrepancy: Cents;
    status: 'matched' | 'discrepancy' | 'unavailable';
  }>;
  netPosition: Cents;            // total revenue - total spend
  blendedRoas: Ratio;
  alerts: string[];
}

// ── System State (§9.19.12) ───────────────────────────

type CultivationSystemState =
  | 'inactive'
  | 'active'
  | 'frozen'
  | 'partial_freeze'
  | 'recovering'
  | 'degraded'
  | 'recovery_failed';

// ── Hash-Chained Append Log ───────────────────────────
// Every spend-log and revenue-log entry includes a hash of the previous entry.
// This detects accidental corruption and casual tampering.
// Limitation: an attacker with filesystem write access can recompute the chain.

interface HashChainedEntry<T> {
  data: T;
  prevHash: string;              // SHA-256 of previous entry (hex)
  hash: string;                  // SHA-256 of this entry (hex)
  walIntentId?: string;          // WAL intent ID for idempotent replay (ADR-3)
}

function computeHash(data: unknown, prevHash: string): string {
  const payload = JSON.stringify(data) + prevHash;
  return createHash('sha256').update(payload).digest('hex');
}

function createChainedEntry<T>(data: T, prevHash: string, walIntentId?: string): HashChainedEntry<T> {
  const hash = computeHash(data, prevHash);
  return { data, prevHash, hash, walIntentId };
}

function verifyChain<T>(entries: HashChainedEntry<T>[]): { valid: boolean; brokenAt?: number } {
  for (let i = 0; i < entries.length; i++) {
    const expected = computeHash(entries[i].data, entries[i].prevHash);
    if (expected !== entries[i].hash) {
      return { valid: false, brokenAt: i };
    }
    if (i > 0 && entries[i].prevHash !== entries[i - 1].hash) {
      return { valid: false, brokenAt: i };
    }
  }
  return { valid: true };
}

// ── Atomic File Write ─────────────────────────────────
// write-to-temp + fsync (F_FULLFSYNC on macOS) + rename
// Per ADR-1: all mutable financial file writes use this pattern.

async function atomicWrite(filePath: string, content: string): Promise<void> {
  const tempPath = filePath + '.tmp.' + process.pid;

  // Write to temp file
  const fd = await open(tempPath, 'w');
  try {
    await fd.writeFile(content, 'utf-8');

    // Durable sync — F_FULLFSYNC on macOS, fsync on Linux (§9.18)
    if (platform() === 'darwin') {
      // macOS: fsync() does NOT guarantee physical durability
      // Must use fcntl(fd, F_FULLFSYNC) — 51 is the macOS constant
      // @ts-expect-error — fcntl is available via native binding
      await fd.datasync(); // Node.js datasync maps to fdatasync, not F_FULLFSYNC
      // In production: use native addon or child_process to call fcntl(fd, 51)
      // For now: document the gap — fsync is sufficient for crash safety, not power loss
    } else {
      await fd.sync();
    }
  } finally {
    await fd.close();
  }

  // Atomic rename — on POSIX, rename is atomic
  await rename(tempPath, filePath);
}

// ── Append-Only Log ───────────────────────────────────
// For spend-log.jsonl and revenue-log.jsonl

async function appendToLog<T>(
  logPath: string,
  data: T,
  prevHash: string,
  walIntentId?: string
): Promise<HashChainedEntry<T>> {
  const entry = createChainedEntry(data, prevHash, walIntentId);
  const line = JSON.stringify(entry) + '\n';
  await appendFile(logPath, line, 'utf-8');
  return entry;
}

// ── Idempotent Append (ADR-3 WAL replay) ──────────────
// Before appending during WAL replay, check if the intent ID exists in recent entries.

async function idempotentAppend<T>(
  logPath: string,
  data: T,
  prevHash: string,
  walIntentId: string,
  recentEntries: HashChainedEntry<T>[]
): Promise<HashChainedEntry<T> | null> {
  // Check if this WAL intent was already applied
  const existing = recentEntries.find(e => e.walIntentId === walIntentId);
  if (existing) {
    return null; // Already applied — skip
  }
  return appendToLog(logPath, data, prevHash, walIntentId);
}

// ── Storage Layout ────────────────────────────────────
// ~/.voidforge/treasury/
// ├── vault.enc                 # financial vault (AES-256-GCM, Argon2id)
// ├── budgets.json              # active budget allocations per project
// ├── spend-log.jsonl           # append-only spend log (immutable, hash-chained)
// ├── revenue-log.jsonl         # append-only revenue log (immutable, hash-chained)
// ├── pending-ops.jsonl         # WAL for platform API operations (ADR-3)
// ├── campaigns/
// │   └── {projectId}/
// │       ├── meta-{id}.json
// │       └── google-{id}.json
// ├── reconciliation/
// │   ├── 2026-03-17.json
// │   └── 2026-03-16.json
// └── reports/
//     └── 2026-03.json          # monthly summary

const TREASURY_DIR = join(homedir(), '.voidforge', 'treasury');
const SPEND_LOG = join(TREASURY_DIR, 'spend-log.jsonl');
const REVENUE_LOG = join(TREASURY_DIR, 'revenue-log.jsonl');
const PENDING_OPS = join(TREASURY_DIR, 'pending-ops.jsonl');
const BUDGETS_FILE = join(TREASURY_DIR, 'budgets.json');

// ── Number Formatting (§9.15.4) ───────────────────────

function formatCurrency(cents: Cents, detail: boolean = false): string {
  const dollars = toDollars(cents);
  if (dollars >= 100_000) {
    return dollars >= 1_000_000 ? `$${(dollars / 1_000_000).toFixed(1)}M` : `$${Math.round(dollars / 1000)}K`;
  }
  if (detail) return `$${dollars.toFixed(2)}`;
  if (cents < 0) return `-$${Math.abs(dollars).toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
  return `$${dollars.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
}

function formatRoas(roas: Ratio): string {
  return `${roas.toFixed(1)}x`;
}

function formatPercentage(pct: Percentage, showSign: boolean = false): string {
  const sign = showSign && pct > 0 ? '+' : '';
  return `${sign}${pct.toFixed(1)}%`;
}

export type {
  Transaction, Budget, GrowthCampaign, RevenueEvent, ReconciliationReport,
  CampaignStatus, CampaignEventSource, CampaignStateEvent,
  CultivationSystemState, HashChainedEntry,
  Cents, Percentage, Ratio, AdPlatform, RevenueSource, BankSource, TransactionSource,
};
export {
  toCents, toDollars,
  computeHash, createChainedEntry, verifyChain,
  atomicWrite, appendToLog, idempotentAppend,
  formatCurrency, formatRoas, formatPercentage,
  TREASURY_DIR, SPEND_LOG, REVENUE_LOG, PENDING_OPS, BUDGETS_FILE,
};
