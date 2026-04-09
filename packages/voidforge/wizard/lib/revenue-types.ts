/**
 * Revenue types — re-exports from the revenue-source-adapter pattern for wizard runtime use.
 * ARCH-R2-012: Production code should not import from docs/patterns/ directly.
 */
export type { RevenueSourceAdapter, RevenueCredentials, ConnectionResult, TransactionPage, BalanceResult, DateRange } from '../../../../docs/patterns/revenue-source-adapter.js';
