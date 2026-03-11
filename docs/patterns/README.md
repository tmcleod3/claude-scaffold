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
