# /ux — Galadriel's UX/UI Pass

**AGENT DEPLOYMENT IS MANDATORY.** Step 2 specifies parallel agent launches via the Agent tool. You MUST launch Elrond, Arwen, Samwise, and Celeborn as separate sub-processes. Do NOT shortcut to inline analysis. (Field report #68)

## Dynamic Dispatch (ADR-044)

Opus scans `git diff --stat` and matches changed files against the `description` fields of all agents in `.claude/agents/`. Matching specialists launch alongside the core agents below.

**Dispatch control:** `--light` skips dynamic dispatch (core only). `--solo` runs lead agent only.

## Silver Surfer Pre-Scan (ADR-048)

**MANDATORY — NO EXCEPTIONS.** Launch the Silver Surfer before deploying ANY other agents. This is not negotiable, not deferrable, and not skippable regardless of how simple the task appears. "The task is simple" is NOT a valid reason to skip — the Surfer catches cross-domain relevance that you cannot predict. "I already know which agents to use" is NOT a valid reason — the Surfer reads agent definitions you haven't loaded. Skipping the Surfer is a protocol violation equivalent to skipping the Victory Gauntlet. **If you find yourself thinking "I don't need the Surfer for this" — that is exactly when you need it most.**

Read the `heralding:` field from `.claude/agents/silver-surfer-herald.md` and announce it before launching.

**How to launch:** Use the Agent tool with these exact parameters:
- `description`: "Silver Surfer roster scan"
- `prompt`: "You are the Silver Surfer, Herald of Galactus. Read your instructions from .claude/agents/silver-surfer-herald.md, then execute your task. Command: /ux. User args: <ARGS>. Focus: <FOCUS or 'none'>. Scan the .claude/agents/ directory, read agent descriptions and tags, and return the optimal roster for this command on this codebase."

**After the Surfer returns**, merge its roster with this command's hardcoded lead agents below. Leads are non-negotiable; the Surfer adds specialists.

**`--focus "topic"`** — include in the Surfer's prompt as the focus bias.
**`--light`** — skip the Surfer, use only hardcoded roster below.
**`--solo`** — skip Surfer and all sub-agents, lead only.

## Context Setup
1. Read `/logs/build-state.md` — understand current project state
2. Read `/docs/methods/PRODUCT_DESIGN_FRONTEND.md`
3. Read `/docs/LESSONS.md` — check for UX-relevant lessons (a11y gaps, component gotchas, CSS issues). Flag matches during review.

## Step 0 — Orient
Detect: framework, styling system, component library, routing, state management.
Document in phase log: "How to run", key routes, where components/styles/copy live.

**Screenshot mandate (MANDATORY):** If the app is runnable, start the server, take screenshots of EVERY page via Playwright or browser, and READ them via the Read tool. Without screenshots, the review is code-reading — not visual verification. Take at desktop (1440x900), plus 375px and 768px for responsive proof-of-life.

## Step 1 — Product Surface Map
List every screen/route, primary user journeys, key shared components, and the state taxonomy (loading/empty/error/success/partial/unauthorized). Write to phase log.

## Step 1.75 — Enchantment Review
Before the auditors begin, **Eowyn** `subagent_type: Eowyn` dreams. Read the PRD's brand personality section. Walk through each primary flow and ask:
- Where could this surprise and delight?
- Where does functionality need warmth?
- Do transitions breathe or just appear? (200ms ease-out minimum for panels, modals, state changes)
- Do empty states invite or repel? (illustrations, warm copy, calls to action)
- Does loading feel like anticipation or waiting? (progressive reveals, warm shimmers)
- Do micro-moments celebrate? (toast personality, pin bounces, checkmark draws)
- Is there a consistent motion language? (same duration/easing vocabulary throughout)
- Does the first 5 seconds feel like the brand?
- Could each opportunity be implemented in ~5 lines? (magic must be lightweight)

Log enchantment opportunities to phase log with effort estimates. These are **nice-to-have** — never block ship. But the best ones get implemented in Step 6.

See `PRODUCT_DESIGN_FRONTEND.md` Step 1.75 for full Éowyn protocol.

## Step 2 — Parallel Analysis
Use the Agent tool to run these simultaneously — all are read-only analysis:
- **Agent 1** `subagent_type: Elrond` — UX: information architecture, navigation, task flows, friction points, discoverability, flow intuitiveness.
- **Agent 2** `subagent_type: Arwen` — Visual: spacing, typography, color usage, button hierarchy, visual consistency.
- **Agent 3** `subagent_type: Samwise` — A11y: keyboard navigation, focus management, ARIA labels, color contrast, reduced motion. Keyboard-only testing.
- **Agent 4** `subagent_type: Celeborn` — Design system: spacing token consistency, typography scale, palette adherence, component naming conventions.

**Aragorn** `subagent_type: Aragorn` orchestrates when multiple findings conflict — prioritizes which matter most for users.

Synthesize findings from all agents.

## Step 3 — Sequential Reviews
These require interactive testing:

- **Bilbo** `subagent_type: Bilbo` — Copy: all microcopy (labels, buttons, error messages, empty states, confirmations, destructive warnings). Clear and consistent?
- **Pippin** `subagent_type: Pippin` — Edge cases: resize to 320px, paste emoji in search, click back mid-flow, two tabs, light/dark toggle mid-animation.
- **Frodo** `subagent_type: Frodo` — (conditional) Hardest flow: dedicated attention on the single most critical + complex flow. Skip if no single flow dominates.
- **Legolas** `subagent_type: Legolas` — Code: component architecture, semantic HTML, CSS organization, state management. Reference `/docs/patterns/component.tsx`.
- **Gimli** `subagent_type: Gimli` — Performance: loading states, skeleton screens, layout shift, optimistic UI, mobile responsiveness, touch targets (min 44px).
- **Radagast** `subagent_type: Radagast` — Edge cases + error states: empty/huge/unicode inputs, broken states, dangerous actions without confirmation, validation gaps.

**ERROR STATE TESTING (mandatory):** For every form/action in the UI:
- Submit with intentionally invalid data (duplicate name, wrong format, missing required field)
- Verify the error message is SPECIFIC and ACTIONABLE — never generic ("something went wrong", "failed to save")
- Verify the form state after error allows retry without losing user input
- If the feature involves a resource that can conflict (duplicate slug, duplicate email, taken domain), test the conflict case explicitly
- For every API error the backend can return, verify the UI displays it meaningfully

## Step 4 — Issue Tracker
Log all findings to `/logs/phase-10-ux-audit.md`:

| ID | Title | Severity | Confidence | Category | Location | Current | Expected | Fix | Status |
|----|-------|----------|------------|----------|----------|---------|----------|-----|--------|

Categories: UX, Visual, A11y, Copy, Performance, Edge Case

**Confidence scoring is mandatory.** Every finding includes a confidence score (0-100). If confidence is below 60, escalate to a second agent from a different universe (e.g., if Samwise found it, escalate to Padmé or Nightwing) to verify before including. If the second agent disagrees, drop the finding. High-confidence findings (90+) skip re-verification in Step 7.5.

## Step 5 — Enhancement Specs (before coding)
For each fix: problem statement, proposed solution, acceptance criteria, a11y requirements (**Samwise** `subagent_type: Samwise` signs off), copy (**Bilbo** `subagent_type: Bilbo` signs off). **Faramir** `subagent_type: Faramir` checks whether polish effort targets the right screens — high-traffic core flows, not low-traffic edge pages.

## Step 6 — Implement (small batches)
One batch = one flow or component cluster (max ~200 lines changed). **Boromir** `subagent_type: Boromir` checks: is the polish overengineered? Too many animations? Does complexity hurt performance? **Glorfindel** `subagent_type: Glorfindel` handles the hardest rendering (canvas, WebGL, SVG -- conditional, only if the project has visual complexity). After each batch:
1. Re-run the app
2. Re-walk the affected flow
3. Test keyboard navigation
4. Update issue tracker status
5. Run `npm test` to catch regressions

## Step 7 — Harden Design System
**Arwen** `subagent_type: Arwen` leads. **Haldir** `subagent_type: Haldir` checks transitions between pages, states, and components — loading->success, error->retry, navigate->return. Are they smooth or jarring? Audit shared components (buttons, inputs, cards, modals, toasts) for:
- Consistent variants (primary, secondary, danger, ghost)
- Responsive behavior
- Keyboard focus styles
- Proper ARIA attributes

## Step 7.5 — Pass 2: Re-Verify Fixes
After all fixes are applied, run a verification pass:
- **Samwise** `subagent_type: Samwise` re-audits accessibility on all modified components — verify a11y fixes didn't break other a11y properties
- **Radagast** `subagent_type: Radagast` re-checks edge cases on fixed flows — verify fixes hold under adversarial input
- **Merry** `subagent_type: Merry` pair-verifies Pippin's edge case resolutions — one found it, the other confirms the fix

If Pass 2 finds new issues, fix and re-verify until Samwise, Radagast, and Merry sign off.

## Step 8 — Regression Checklist
Add UX-specific items to the regression checklist in `/docs/qa-prompt.md`:

| # | Flow | A11y Check | Responsive Check | Status |
|---|------|-----------|-----------------|--------|

## Step 9 — Deliverables
1. UX_UI_AUDIT.md — all findings
2. Updated regression checklist in qa-prompt.md
3. Code fixes
4. "Next improvements" backlog in phase log

## Arguments
- `--focus "topic"` → Bias Herald toward topic (natural-language, additive)

## Handoffs
- Backend issues → Stark, log to `/logs/handoffs.md`
- Security issues → Kenobi, log to `/logs/handoffs.md`
- Architecture issues → Picard, log to `/logs/handoffs.md`
- Non-UI bugs → Batman, log to `/logs/handoffs.md`
