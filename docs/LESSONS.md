# Lessons Learned

> Patterns that worked, patterns that failed, and decisions worth remembering. Updated after each project. When a lesson is confirmed across multiple projects, promote it into the relevant method doc.

## How to Use This File

1. After completing a project (or a significant phase), add entries below
2. Tag each lesson with the relevant agent and category
3. When a pattern proves reliable across 2+ projects, move it into the method doc
4. Delete lessons that turn out to be wrong or context-specific

## Template

```
### [Short title]
**Agent:** [Who discovered this] | **Category:** [pattern/antipattern/decision/gotcha]
**Context:** [What project/situation]
**Lesson:** [What we learned]
**Action:** [What to do differently / what to keep doing]
**Promoted to:** [method doc name, if promoted] or "Not yet"
```

---

## Lessons

### Agents verify files in isolation — must follow the data across modules
**Agent:** Spock, Seven, Data (all three) | **Category:** antipattern
**Context:** Kongo.io Sprint 4 — 3 bugs escaped 4+ rounds of /review across parallel agents
**Lesson:** Review agents read files in the diff and check each against patterns, but never follow the data flow to the consumer. An avatar upload used key prefix `avatars/` but the asset proxy only allowed `uploads/`. An API returned a specific error but the UI displayed a generic fallback. A CSV import had no template for users to discover the schema. All three were caught by manual user testing.
**Action:** Added three mandatory rules: (1) Integration Tracing — when code produces URLs/keys/data consumed elsewhere, read the consumer. (2) Error Path Verification — verify the UI displays specific server errors, not generic fallbacks. (3) Error State Testing — test forms with intentionally invalid/conflicting input.
**Promoted to:** `/review` (integration tracing + error paths), `/ux` (error state testing), `/qa` (smoke tests), `/test` (integration tests)

### Static analysis cannot replace hitting the running server
**Agent:** Batman | **Category:** antipattern
**Context:** Kongo.io Sprint 4 — asset proxy 404 only discoverable at runtime
**Lesson:** Code review reads source files. But some bugs only manifest when the server processes an actual request — the asset proxy's `startsWith("uploads/")` check was invisible to static analysis because both the upload route and the proxy individually looked correct.
**Action:** Added Step 2.5 (Smoke Tests) to /qa — after build, execute actual HTTP requests against localhost for each new feature. Upload a file then fetch the URL. Submit valid then invalid data. Verify cross-module paths at runtime.
**Promoted to:** `/qa` (Step 2.5 — Smoke Tests)
