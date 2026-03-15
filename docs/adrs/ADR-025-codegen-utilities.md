# ADR-025: Code Generation Utilities (DX Release)

## Status: Accepted

## Context
Developers spend time on repetitive setup: Prisma type exports, API docs stubs, ERD diagrams, seed scripts, and integration boilerplate (Stripe, Resend, S3). These can be generated from the existing project state (Prisma schema, PRD frontmatter).

## Decision
Add 5 code generators in `wizard/lib/codegen/`:
1. **prisma-types.ts** — Runs `prisma generate` + creates `types/index.ts` barrel export. Conditional on `prisma/schema.prisma` existing.
2. **openapi-gen.ts** — Generates a starter `docs/api.yaml` OpenAPI spec. Framework-aware (port, conventions).
3. **erd-gen.ts** — Parses Prisma schema and generates `docs/schema.md` with a Mermaid ERD. Minimal parser, handles common cases.
4. **seed-gen.ts** — Parses Prisma schema and generates `prisma/seed.ts` with factory functions per model.
5. **integrations.ts** — Pre-built client wrappers for Stripe, Resend, and S3. Selected via PRD frontmatter (`payments: stripe`, `email: resend`, `storage: s3`).

All generators are conditional — they skip gracefully when prerequisites are missing (no schema, no frontmatter flag). All emit SSE events for progress. All are non-fatal.

## Consequences
- Prisma-dependent generators only work with Prisma (not TypeORM, Drizzle, etc.)
- OpenAPI spec is a starter — user must fill in their actual endpoints
- Integration templates are TypeScript only (Python templates deferred)
- Sentry integration already exists in `sentry-generator.ts` (v4.1) — not duplicated here
