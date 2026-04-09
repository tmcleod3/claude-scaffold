/**
 * Ad billing adapter types — re-exports from the pattern file.
 * ARCH-R2-012: Production code should not import from docs/patterns/ directly.
 */
export type {
  AdBillingSetup, AdBillingAdapter,
  CapabilityState, BillingMode, AdPlatform,
  Invoice, InvoiceLineItem, ExpectedDebit,
  SettlementInstruction, PlatformBillingProfile,
  BillingConfiguration, NormalizedFundingState, DateRange,
  Cents,
} from '../../patterns/ad-billing-adapter.js';

export { toCents } from '../../patterns/ad-billing-adapter.js';
