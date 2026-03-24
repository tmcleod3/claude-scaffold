# ADR-034: Raw HTTPS for External API Integrations
## Status: Accepted
## Date: 2026-03-24

## Context
VoidForge's zero-dependency philosophy (CLAUDE.md: "No new dependencies without explicit justification") conflicts with the common practice of using platform SDKs (e.g., `stripe` npm package) for API integrations. The Stripe revenue adapter needs to call Stripe's REST API. The ad platform adapters (when implemented) will need to call Meta, Google, etc.

## Decision
Use `node:https` directly for all external API integrations. No platform SDKs. The Stripe adapter (`wizard/lib/adapters/stripe.ts`) demonstrates the pattern: a thin `stripeGet()` helper wrapping `node:https.request`, with typed response parsing and error handling.

## Implementation Scope
Fully implemented in v17.0 (Stripe adapter). Pattern established for future adapters.

## Consequences
**Enables:** Zero additional dependencies. No supply chain risk from platform SDKs. Full control over request/response handling, timeout behavior, and error paths. The adapter is ~160 lines — smaller than the Stripe SDK's type definitions alone.
**Prevents:** Automatic retry logic, webhook signature verification helpers, and API version tracking that SDKs provide. These must be implemented manually when needed.
**Trade-off:** More code per adapter (~150-200 lines vs ~50 with SDK). Accepted because: (1) each adapter is written once, (2) VoidForge already has the outbound rate limiter pattern, (3) the zero-dependency constraint is a hard requirement.

## Alternatives
1. **Use platform SDKs** — Rejected. Adds 5-50MB of dependencies per platform. Stripe SDK alone is 3.2MB + types. Six platform SDKs would exceed the entire VoidForge codebase.
2. **Use a generic HTTP client (got, axios)** — Rejected. Adds a dependency for functionality Node.js already provides. `node:https` + `JSON.parse` is sufficient for REST APIs.
3. **Generate API clients from OpenAPI specs** — Considered for future. Would provide type safety without runtime dependencies. Deferred until multiple adapters share enough patterns to justify the tooling.
