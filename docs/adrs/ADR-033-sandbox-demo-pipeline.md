# ADR-033: Sandbox Demo Pipeline
## Status: Accepted
## Date: 2026-03-24

## Context
The Cultivation Growth Engine requires ad platform and bank adapters to function. Real adapters (Google Ads, Meta, etc.) require developer accounts that may not be available. The pipeline needs to be demonstrable without external dependencies.

## Decision
Create `SandboxAdapter` (ad platform) and `SandboxBankAdapter` (revenue) as full implementations that return realistic fake data. Every method returns valid-shaped data matching the pattern interfaces. No throws. These are first-class adapters, not mocks — they demonstrate the full pipeline: campaign creation, spend tracking, performance metrics, treasury balance, transactions.

The sandbox adapters are registered in `PLATFORM_REGISTRY` with `sandbox: true` and `implemented: true`. The heartbeat daemon, Danger Room dashboard, reconciliation engine, and safety tiers all work with sandbox data exactly as they would with real platform data.

## Implementation Scope
Fully implemented in v17.0.

## Consequences
**Enables:** Full Cultivation pipeline demo without API credentials. Users can see data flowing through dashboards, daemon jobs running, circuit breakers evaluating. Onboarding is immediate.
**Prevents:** Nothing — real adapters (Stripe already implemented, others planned) coexist alongside sandbox.
**Trade-off:** Sandbox data is deterministic-ish (seeded with random values that drift). Not suitable for load testing or performance benchmarking. Dashboard shows "Sandbox (Demo)" label to avoid confusion.

## Alternatives
1. **Jest-style mocks at test boundaries** — Rejected. Mocks don't demonstrate the pipeline to users; they only help developers test.
2. **Recorded API responses (VCR pattern)** — Rejected. Requires real API calls first to record, which requires the accounts we don't have.
3. **No demo mode, wait for real accounts** — Rejected. Cultivation would remain non-functional indefinitely.
