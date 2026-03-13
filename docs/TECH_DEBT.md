# VoidForge — Tech Debt Catalog

**Version:** 2.7.0
**Last reviewed:** 2026-03-12

## Resolved

| Item | ADR | Resolved In |
|------|-----|-------------|
| No provision crash recovery | ADR-001 | v2.6.0 |
| Non-atomic vault writes | ADR-002 | v2.6.0 |
| Unvalidated API responses | ADR-003 | v2.7.0 |
| No SSE keepalive | ADR-004 | v2.7.0 |

## Current

| # | Item | Type | Impact | Effort | Urgency |
|---|------|------|--------|--------|---------|
| 1 | No truncated PRD detection | Missing check | Medium — user gets partial PRD without warning | Low | Next release |
| 2 | No project creation rollback | Missing check | Low — partial directory on disk full/permissions error | Low | Next release |
| 3 | `sendJson` duplicated in 6 API files | Missing abstraction | Low — maintenance | Low | Low |
| 4 | `.env` append logic duplicated across provisioners | Missing abstraction | Low — maintenance | Low | Low |
| 5 | `recordResourceCleaned` defined but never called | Dead code | Low — confusion | Trivial | Low |
| 6 | Fallback model ID `claude-sonnet-4-5-20241022` | Deferred decision | Low — used only when models API unreachable | Trivial | Check periodically |
| 7 | Flat vault namespace (no multi-project isolation) | Wrong abstraction | Medium — all projects share credentials | Medium | Later |
| 8 | No vault schema versioning | Deferred decision | Medium — blocks schema changes | Low | Later |
| 9 | Raw HTTPS vs AWS SDK inconsistency | Dependency debt | Low — two HTTP patterns to maintain | High | Later |
| 10 | PBKDF2 vs Argon2id for key derivation | Deferred decision | Low — PBKDF2 is still safe at 100k iterations | Medium | Much later |

## Recommended Next Actions

1. **#1 — Truncated PRD:** If SSE stream ends without `[DONE]` or content is suspiciously short (<500 chars), show a warning banner.
2. **#2 — Project rollback:** On creation failure, attempt to delete the partially created directory.
3. **#5 — Dead code:** Either call `recordResourceCleaned` during cleanup, or remove it.
