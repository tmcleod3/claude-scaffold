/**
 * Financial core — re-exports from the financial-transaction pattern for wizard runtime use.
 * ARCH-R2-012: Production code should not import from docs/patterns/ directly.
 */
export { atomicWrite, appendToLog, idempotentAppend, toCents, toDollars, formatCurrency, formatRoas, formatPercentage, SPEND_LOG, REVENUE_LOG, TREASURY_DIR } from './patterns/financial-transaction.js';
export type { Cents, ReconciliationReport, Transaction, Budget, GrowthCampaign, RevenueEvent } from './patterns/financial-transaction.js';
