# ADR-024: Optional Sentry Error Tracking Integration

## Status: Accepted

## Context
Runtime errors in deployed apps go unnoticed until users report them. Sentry is the industry standard for error tracking but requires SDK initialization code and a DSN env var.

## Decision
Generate Sentry SDK initialization code when a `sentry-dsn` key exists in the vault. The generated file (`sentry.ts` or `sentry.py`) initializes the SDK with the DSN from environment variables. Framework-aware: Next.js uses `@sentry/nextjs`, Express uses `@sentry/node`, Django uses `sentry-sdk`.

Lives in `wizard/lib/sentry-generator.ts`. Called from `provision.ts` after env writing. Non-fatal — works without Sentry.

## Consequences
- Error tracking is opt-in (only if DSN in vault)
- Generated code is framework-specific
- User must install the Sentry SDK dependency themselves
- DSN is stored as an env var, not hardcoded
