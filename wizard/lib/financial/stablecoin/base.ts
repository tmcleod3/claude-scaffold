/**
 * Stablecoin adapter types — re-exports from the pattern file.
 * ARCH-R2-012: Production code should not import from docs/patterns/ directly.
 */
export type {
  StablecoinSetup, StablecoinAdapter,
  StablecoinProvider, SupportedAsset, ProviderCredentials,
  StablecoinBalance, FiatBalance, CombinedBalances,
  OfframpQuote, TransferStatus, TransferRecord, TransferStatusDetail,
  FundingPlanRef, DateRange,
} from '../../../../docs/patterns/stablecoin-adapter.js';

export { toCents, toDollars, computeTransferHash } from '../../../../docs/patterns/stablecoin-adapter.js';
