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

### Clamp values BEFORE constructing the object that consumes them
**Agent:** Batman (DC) | **Category:** gotcha
**Context:** VoidForge v7.1.0 Gauntlet — PTY cols/rows clamping placed after spawnOptions construction
**Lesson:** JavaScript objects capture values by-value at construction time. Reassigning the local variable AFTER the object is created does NOT update the object's field. The PTY spawned with unclamped values because the clamping was placed between `spawnOptions = { cols, rows }` and `pty.spawn(shell, [], spawnOptions)`. Moving the clamp BEFORE the object construction fixed it.
**Action:** When validating/sanitizing input, always do it BEFORE constructing any object or calling any function that uses the values. Never clamp between object construction and usage.
**Promoted to:** Not yet

### Synchronous lock acquisition before async work prevents TOCTOU in Node.js
**Agent:** Loki (Marvel) | **Category:** pattern
**Context:** VoidForge v7.1.0 Gauntlet — concurrent provisioning race condition
**Lesson:** The provisioning endpoint checked `if (activeProvisionRun)` then did async work (JSON parsing, credential loading) before setting `activeProvisionRun = runId`. Two requests arriving in the same event loop tick could both pass the check. Fix: set the lock IMMEDIATELY (synchronously) after the check, before any `await`.
**Action:** For single-process mutex patterns in Node.js, always check-and-set in the same synchronous block. Never put async work between the check and the set.
**Promoted to:** `docs/methods/BACKEND_ENGINEER.md` (Node.js Single-Process Mutex gotcha)

### CSS animation replay requires reflow between class removal and re-addition
**Agent:** Constantine (DC) | **Category:** gotcha
**Context:** VoidForge v7.1.0 Gauntlet — forge-lit pulse animation only fired once
**Lesson:** Adding a CSS class that triggers an animation only works the first time. Re-adding the same class is a no-op if it's already present. To replay: remove the class, force a reflow (`void element.offsetWidth`), then re-add the class. Without the reflow, the browser batches the remove+add and skips the animation.
**Action:** When CSS animations need to replay on repeated user actions, use the remove-reflow-add pattern.
**Promoted to:** Not yet

### Shell profiles can re-inject environment variables you filtered out
**Agent:** Deathstroke (DC) | **Category:** gotcha
**Context:** VoidForge v7.1.0 Gauntlet — ANTHROPIC_API_KEY removed from PTY env but shell profile could re-export it
**Lesson:** Filtering environment variables from a PTY's initial env only controls what's explicitly passed. If the PTY spawns a login shell that sources `.zshrc`/`.bashrc`, any `export` statements in the profile will re-inject variables. This is an accepted design tradeoff — you can't control user shell configuration without breaking their environment.
**Action:** Document this limitation. For true isolation, use containerized environments or non-login shells with `--noprofile --norc`.
**Promoted to:** Not yet

### Iframe stacking context defeats z-index
**Agent:** Galadriel (UX) | **Category:** gotcha
**Context:** Dialog Travel map overlay (field report #79)
**Lesson:** Iframes with `allow-same-origin` create impenetrable stacking contexts. z-index has no effect across stacking context boundaries — a `z-index: 9999` overlay inside the main document cannot appear above an iframe's stacking context.
**Action:** Use `createPortal(element, document.body)` for any overlay that coexists with iframes. See `docs/patterns/component.tsx` Portal Pattern.
**Promoted to:** docs/patterns/component.tsx (Portal Pattern)
