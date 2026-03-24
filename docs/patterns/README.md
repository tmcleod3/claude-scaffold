# Code Patterns

Reference implementations for common code structures. These show the **shape and principles** — adapt to your project's stack and conventions. All patterns include framework adaptation notes.

| Pattern | File | When to Reference | Frameworks Shown |
|---------|------|------------------|-----------------|
| API Route | `api-route.ts` | Building any API endpoint | Next.js (Express/Django/Rails notes) |
| Service Layer | `service.ts` | Writing business logic | Next.js + Prisma (Django/Rails notes) |
| Component | `component.tsx` | Building UI components | React (Vue/Svelte/server-template notes) |
| Middleware | `middleware.ts` | Auth, logging, rate limiting | Next.js (Express/Django/Rails notes) |
| Error Handling | `error-handling.ts` | Canonical error strategy | Next.js + Express + Django + Rails |
| Job Queue | `job-queue.ts` | Background jobs, async work | BullMQ + Celery + Sidekiq |
| Multi-Tenant | `multi-tenant.ts` | Workspace/org scoping | Next.js + Django + Rails |
| Third-Party Script | `third-party-script.ts` | Loading external scripts (3 states) | Browser |
| Mobile Screen | `mobile-screen.tsx` | React Native screen with safe area, a11y | React Native |
| Mobile Service | `mobile-service.ts` | Offline-first data with sync queue | React Native |
| Game Loop | `game-loop.ts` | Fixed timestep with interpolation | Phaser/Three.js/Pixi |
| Game State | `game-state.ts` | Hierarchical state machine with save/load | Any game engine |
| Game Entity | `game-entity.ts` | Entity Component System | Any game engine |
| SSE Endpoint | `sse-endpoint.ts` | Server-Sent Events with lifecycle | Express/FastAPI/Django |
| Ad Platform Adapter | `ad-platform-adapter.ts` | Split setup/runtime/readonly interfaces | Google/Meta/LinkedIn/Twitter |
| Financial Transaction | `financial-transaction.ts` | Branded Cents, hash-chained log, atomic writes | Any |
| Daemon Process | `daemon-process.ts` | PID management, Unix socket, signal handling | Node.js |
| Revenue Source Adapter | `revenue-source-adapter.ts` | Read-only revenue interface | Stripe/Paddle |
| OAuth Token Lifecycle | `oauth-token-lifecycle.ts` | Refresh at 80% TTL, vault integration | Any OAuth provider |
| Outbound Rate Limiter | `outbound-rate-limiter.ts` | Safety margins, daily quotas, retry logic | Any API client |
| AI Orchestrator | `ai-orchestrator.ts` | Agent loops, tool use, retry, circuit breaker | Anthropic SDK (OpenAI notes) |
| AI Classifier | `ai-classifier.ts` | Classification with confidence thresholds, fallback chains | Anthropic SDK (OpenAI notes) |
| AI Router | `ai-router.ts` | Intent-based routing with fallback chains | Anthropic SDK (OpenAI notes) |
| Prompt Template | `prompt-template.ts` | Versioned prompts, variable injection, guardrails | Any (provider-agnostic) |
| AI Eval | `ai-eval.ts` | Golden datasets, scoring functions, regression detection | Any (provider-agnostic) |
| AI Tool Schema | `ai-tool-schema.ts` | Typed tool definitions, provider adapters | Anthropic + OpenAI |
| Database Migration | `database-migration.ts` | Safe migrations: backward-compat, batched ops, rollback, zero-downtime | Prisma, Alembic, ActiveRecord, Django |
| Data Pipeline | `data-pipeline.ts` | ETL with checkpoint/resume, quality checks, idempotent processing | Node.js streams, Python polars, SQL/dbt |
| Backtest Engine | `backtest-engine.ts` | Walk-forward validation, no-lookahead, Sharpe/drawdown metrics | Python vectorbt/backtrader |
| Execution Safety | `execution-safety.ts` | Order validation, position limits, exchange precision, paper/live toggle | CCXT, Alpaca, IBKR |

## How to Use

1. Read the relevant pattern before writing new code in that category
2. Match the structure (validation, error handling, response format, all states)
3. Adapt to your stack — the pattern shows the *shape*, your code fills in the specifics
4. All patterns include comments noting the framework-specific equivalent

## Adding New Patterns

When you discover a pattern that should be standardized:

1. Create a new file in this directory
2. Include: purpose comment, the pattern, inline notes, framework adaptations
3. Add it to the table above
4. Reference it in the relevant method doc
