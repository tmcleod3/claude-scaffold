/**
 * Treasury Heartbeat — re-export hub.
 *
 * This file was split into focused modules:
 *   - treasury-io.ts          — State persistence, WAL, transfers, funding plans
 *   - treasury-circuit-breakers.ts — Circuit breaker evaluation (PRD S13.2)
 *   - treasury-jobs.ts        — 9 scheduled heartbeat jobs + auto-funding executor
 *   - treasury-handlers.ts    — Socket request handlers (POST/GET routes)
 *
 * All exports are re-exported here for backward compatibility — any file
 * importing from 'treasury-heartbeat.js' continues to work unchanged.
 */

// ── treasury-io.ts ───────────────────────────────────
export {
  isStablecoinConfigured,
  getTreasuryStateSnapshot,
  executeTreasuryFreeze,
} from './treasury-io.js';

export type {
  TreasuryHeartbeatState,
  PendingTransfer,
  Logger,
  WriteStateFn,
  FreezeFn,
} from './treasury-io.js';

// ── treasury-circuit-breakers.ts ─────────────────────
export {
  evaluateCircuitBreakers,
  evaluateTransferSlaBreaker,
  evaluateBillingBreakers,
} from './treasury-circuit-breakers.js';

export type {
  CircuitBreakerResult,
} from './treasury-circuit-breakers.js';

// ── treasury-jobs.ts ─────────────────────────────────
export {
  registerTreasuryJobs,
} from './treasury-jobs.js';

// ── treasury-handlers.ts ─────────────────────────────
export {
  handleTreasuryRequest,
} from './treasury-handlers.js';
