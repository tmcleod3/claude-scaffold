# ADR-057: Red-Team Agent Scope Constraints

## Status
Accepted — 2026-04-20 (Maul implemented v23.8.13)

## Context
Maul's operational learning at `.claude/agents/maul-red-team.md:42` read: *"RUNTIME EXPLOITATION (mandatory): execute actual attack requests via curl or equivalent HTTP client. Do not just theorize about vulnerabilities — prove them with real requests against the running application."*

With `Bash` tool access and no scope constraint, Maul could send live exploit traffic against any host in the project's config or env — production included. Anakin's dark-side scan identified two companion agents with similar (lower-severity) patterns: Barton (mandatory curl-everything) and Red Hood (destructive operations, process kills).

## Decision

**Maul (v23.8.13):** scope runtime exploitation to localhost or explicitly user-confirmed targets. Private-IP check (127.0.0.1, ::1, 10.x, 172.16–31.x, 192.168.x) OR user has named the non-local target in the session. Any other host → stop and ask for explicit confirmation before executing.

**Barton (v23.9.0):** scope smoke-test curl to localhost or user-specified test environments.

**Red Hood (v23.9.0):** scope destructive operations (process kills, state corruption) to local test environments only.

**Rei remains the template** — she audits dangerous operations; she doesn't execute them without scope.

## Consequences
**Positive:** prevents accidental production probing. Closes liability gap.
**Negative:** legitimate external red-team now requires an explicit opt-in.
**Neutral:** Bash tool access unchanged; the scope gate is semantic.

## Alternatives Considered
- Remove `Bash` from Maul's tool list — too aggressive; Maul needs Bash for legitimate local testing.
- Trust the prompt alone — seven field incidents of prompt-only enforcement failure argue against it.

## Related ADRs
Lessons from ADR-048 (prompt-only enforcement proved inadequate; same principle applies here).

## Rollout
- v23.8.13: Maul.
- v23.9.0: Barton, Red Hood.
