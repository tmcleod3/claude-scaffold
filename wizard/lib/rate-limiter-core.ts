/**
 * Rate limiter core — re-exports from the outbound-rate-limiter pattern for wizard runtime use.
 * ARCH-R2-012: Production code should not import from docs/patterns/ directly.
 */
export { OutboundRateLimiter, getLimiter } from '../../docs/patterns/outbound-rate-limiter.js';
