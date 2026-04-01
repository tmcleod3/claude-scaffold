# Project Operational Learnings

Persistent knowledge from live operations. Things code reviews can't catch.
Updated: YYYY-MM-DD | Entries: 0/50

---

## API Behavior

<!-- External API quirks, rate limits, undocumented constraints -->

## Decisions

<!-- "We chose X over Y because Z" — prevents re-evaluation -->

## Root Causes

<!-- Bugs that took multiple attempts to diagnose — prevents re-investigation -->

## Environment Quirks

<!-- Platform, hosting, tooling behaviors specific to this project -->

## Vendor

<!-- Third-party service behaviors, gotchas, workarounds -->

## Workflow

<!-- Process discoveries, agent coordination patterns, build order dependencies -->

## Archived

<!-- Entries stale for 180+ days or no longer relevant. Kept for historical reference. -->

---

<!-- ENTRY FORMAT:

### [Short title]
[One-line description of the operational fact]

- **category:** api-behavior | decision | env-quirk | root-cause | vendor | workflow
- **verified:** YYYY-MM-DD
- **scope:** [component or module this affects]
- **evidence:** [how this was discovered — session, command, or test that found it]
- **context:** [when/why this is true — so future sessions can judge applicability]

RULES:
- 50 active entries max. Archive or promote before adding entry 51.
- Entries older than 90 days without re-verification are flagged stale at read time.
- Promoted entries (appeared in 2+ projects) move to docs/LESSONS.md with a pointer here.
- Never store config values (.env), code patterns (LESSONS.md), or methodology gaps (field reports).
- Every entry needs evidence. "I think X" is not a learning. "Tested X, got Y" is.

STALENESS PROTOCOL:
- At read time: flag entries where today - verified > 90 days
- Agent notes: "Learning '[title]' is [N] days old — verify before relying on it"
- Behavioral consequence: do NOT use stale entries as constraints without re-verifying first.
  Stale entries inform investigation direction but must not block or redirect decisions.
- Re-verification resets the clock: update verified date after confirming still true
- Entries stale for 180+ days: move to ## Archived section

PROMOTION PROTOCOL (Wong):
- Learning appears in 2+ unrelated projects → promote to docs/LESSONS.md
- Replace the learning with: → Promoted to LESSONS.md: [entry name]
- Pointer stays in LEARNINGS.md for traceability; content lives in LESSONS.md only
-->
