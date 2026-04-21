# SPEC_HANDOFF — Cross-Session Implementation Hand-off
## System Protocol · Introduced by: field reports #307, #308

## When to Use

When a session would benefit from offloading mechanical implementation work to a different session (separate context window, separate repo, separate worktree) while preserving the orchestrator's context for synthesis and review.

Typical triggers:
- Multi-repo campaign (e.g., scaffold methodology update + marketing-site content update)
- Large-but-mechanical work (26-finding spec executed without back-and-forth — v23.9.x demonstrated this)
- Executor needs fresh context; orchestrator needs to stay on high-level synthesis

## The Pattern

### Session A (orchestrator) produces the spec

Spec doc lives at `docs/SITE_UPDATE_SPEC.md` or similar in the TARGET repo (so the executing session finds it by path).

Required structure:
1. **Title** with date and source.
2. **Numbered findings** — each finding has ID, severity (Critical / High / Should / Nice-to-have), file:line citation, proposed change, and a `verified-against-commit: <SHA>` field. The verified-against-commit field lets Session B fast-skip any finding whose state hasn't changed since the spec was authored.
3. **Phases** — group findings by logical phase (data fixes, new pages, content rewrite, test updates, typecheck/build). One commit per phase.
4. **Nav-order requirements for new pages** — if the spec proposes creating new pages in a linear tutorial/flow, explicitly state `prev=<page>, next=<page>` for each new page. Without this, the executor guesses and often chooses the wrong direction (field report #308 RC-7).
5. **Success criteria** — typecheck green, tests green, build green, optional per-phase smoke checks.

### Session B (executor) receives the hand-off prompt

Copy-pasteable prompt template:
```
Read docs/SITE_UPDATE_SPEC.md in this repo. Execute phases in order.
Commit per phase with CHANGELOG entry. Run typecheck + test + build between phases.
If you hit a blocker, stop and save state — do not improvise.
```

### Session B validates before acting

For each finding: `git show <verified-against-commit>:<path>` and compare to local HEAD. If they match, the claimed state is current — execute as planned. If they differ, the state has moved; re-evaluate before applying.

## Evidence

- Field report #308: 23/26 items executed across 5 phases. 3 Must-Fix items slipped through (all related to spec gaps around nav direction and table captions). Net positive — saved ~20k tokens of orchestrator context.
- Field report #307 F4: CAMPAIGN.md convention for `verified-against-commit: <SHA>` stamping.

## Limitations

- Executor may optimize for literal compliance over holistic UX (nav direction example above).
- Spec must include nav order, table captions, and a11y requirements for new components explicitly.
- Orchestrator MUST run a review pass (`/engage`) on the executor's output before considering the hand-off complete.

## Handoffs

- After executor completes, orchestrator runs `/engage` then `/assemble --fast` on the affected files to surface integration issues.
- If the executor skipped findings whose `verified-against-commit` matched local HEAD, note which in the completion report — helps validate the SHA-skip heuristic.
