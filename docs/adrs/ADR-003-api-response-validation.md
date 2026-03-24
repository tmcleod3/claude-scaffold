# ADR-003: Validate External API Responses at Boundaries

## Status: Accepted (implemented via safeJsonParse + optional chaining)

## Context

VoidForge integrates with 5 external APIs. The AWS SDK provides typed responses via TypeScript definitions. The remaining 4 (Anthropic, Vercel, Railway, Cloudflare) use raw `node:https` with `JSON.parse` and unvalidated property access. A changed API response shape produces a confusing runtime error deep in business logic.

The project's own CLAUDE.md states: "Validate at boundaries. Zod schemas on all API inputs."

## Decision

Add lightweight response validation for all raw HTTPS integrations:
1. Define expected response shapes as TypeScript types (already partially done)
2. Validate critical fields exist before accessing them
3. For Anthropic streaming: validate each SSE event has expected `type` and `delta` shape
4. For validation APIs: check for expected `status`/`success` fields, return clear error on unexpected shapes

Full Zod schemas are optional for validation-only endpoints (Vercel/Railway/Cloudflare) since they're simple shape checks. Anthropic streaming responses warrant more rigorous validation.

## Consequences

- **Enables:** Clear error messages when APIs change, defensive coding
- **Trade-off:** Minor verbosity in response handling
- **Prevents:** Confusing runtime errors from API drift

## Alternatives

1. **Add Zod as dependency** — Acceptable but not required for current scope
2. **Switch to official SDKs** — Anthropic SDK would help; Vercel/Railway SDKs add unnecessary weight for validation-only calls
3. **Do nothing** — Rejected: violates own coding standards
