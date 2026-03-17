# /ux — Galadriel's UX/UI Pass

**AGENT DEPLOYMENT IS MANDATORY.** Step 2 specifies parallel agent launches via the Agent tool. You MUST launch Elrond, Arwen, Samwise, and Celeborn as separate sub-processes. Do NOT shortcut to inline analysis. (Field report #68)

## Context Setup
1. Read `/logs/build-state.md` — understand current project state
2. Read `/docs/methods/PRODUCT_DESIGN_FRONTEND.md`
3. Read `/docs/LESSONS.md` — check for UX-relevant lessons (a11y gaps, component gotchas, CSS issues). Flag matches during review.

## Step 0 — Orient
Detect: framework, styling system, component library, routing, state management.
Document in phase log: "How to run", key routes, where components/styles/copy live.

## Step 1 — Product Surface Map
List every screen/route, primary user journeys, key shared components, and the state taxonomy (loading/empty/error/success/partial/unauthorized). Write to phase log.

## Step 1.75 — Éowyn's Enchantment Review
Before the auditors begin, Éowyn dreams. Read the PRD's brand personality section. Walk through each primary flow and ask:
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
- **Agent 1 (Elrond — UX):** Review information architecture, navigation, task flows, friction points. Can users find things? Are flows intuitive?
- **Agent 2 (Arwen — Visual):** Review spacing, typography, color usage, button hierarchy, visual consistency. Does it look intentional?
- **Agent 3 (Samwise — A11y):** Check keyboard navigation, focus management, ARIA labels, color contrast, reduced motion. Test with keyboard-only navigation.
- **Agent 4 (Celeborn — Design System):** Are spacing tokens consistent? Typography scale followed? Colors from the palette? Component naming conventions respected? Catches systemic inconsistencies (e.g., `gap-4` vs `gap-[18px]` for the same spacing).

**Aragorn** orchestrates when multiple findings conflict — prioritizes which matter most for users.

Synthesize findings from all agents.

## Step 3 — Sequential Reviews
These require interactive testing:

**Bilbo (Copy):** Review all microcopy — labels, buttons, error messages, empty states, confirmations, destructive action warnings. Does the product speak clearly and consistently?

**Pippin (Edge Cases):** Does the unexpected — resizes to 320px, pastes emoji in search, clicks back mid-flow, opens the same page in two tabs, toggles between light/dark mid-animation.

**Frodo (Hardest Flow):** If the project has one flow that is both the most critical AND the most complex, Frodo gets dedicated attention on that single flow. Conditional — skip if no single flow dominates.

**Legolas (Code):** Review component architecture — semantic HTML, CSS organization, state management patterns. Reference `/docs/patterns/component.tsx`.

**Gimli (Performance):** Check loading states, skeleton screens, layout shift, optimistic UI, mobile responsiveness, touch targets (min 44px).

**Radagast (Edge Cases + Error States):** Test forms with empty/huge/unicode inputs, broken states, dangerous actions without confirmation, validation gaps.

**ERROR STATE TESTING (mandatory):** For every form/action in the UI:
- Submit with intentionally invalid data (duplicate name, wrong format, missing required field)
- Verify the error message is SPECIFIC and ACTIONABLE — never generic ("something went wrong", "failed to save")
- Verify the form state after error allows retry without losing user input
- If the feature involves a resource that can conflict (duplicate slug, duplicate email, taken domain), test the conflict case explicitly
- For every API error the backend can return, verify the UI displays it meaningfully

## Step 4 — Issue Tracker
Log all findings to `/logs/phase-10-ux-audit.md`:

| ID | Title | Severity | Category | Location | Current | Expected | Fix | Status |
|----|-------|----------|----------|----------|---------|----------|-----|--------|

Categories: UX, Visual, A11y, Copy, Performance, Edge Case

## Step 5 — Enhancement Specs (before coding)
For each fix: problem statement, proposed solution, acceptance criteria, a11y requirements (Samwise signs off), copy (Bilbo signs off). **Faramir** checks whether polish effort targets the right screens — high-traffic core flows, not low-traffic edge pages.

## Step 6 — Implement (small batches — **Boromir** guards against hubris)
One batch = one flow or component cluster (max ~200 lines changed). **Boromir** checks: is the polish overengineered? Too many animations? Does complexity hurt performance? **Glorfindel** handles the hardest rendering (canvas, WebGL, SVG — conditional, only if the project has visual complexity). After each batch:
1. Re-run the app
2. Re-walk the affected flow
3. Test keyboard navigation
4. Update issue tracker status
5. Run `npm test` to catch regressions

## Step 7 — Harden Design System (**Haldir** guards boundaries)
Arwen leads. **Haldir** checks transitions between pages, states, and components — loading→success, error→retry, navigate→return. Are they smooth or jarring? Audit shared components (buttons, inputs, cards, modals, toasts) for:
- Consistent variants (primary, secondary, danger, ghost)
- Responsive behavior
- Keyboard focus styles
- Proper ARIA attributes

## Step 7.5 — Pass 2: Re-Verify Fixes
After all fixes are applied, run a verification pass:
- **Samwise** re-audits accessibility on all modified components — verify a11y fixes didn't break other a11y properties
- **Radagast** re-checks edge cases on fixed flows — verify fixes hold under adversarial input
- **Merry** pair-verifies Pippin's edge case resolutions — one found it, the other confirms the fix

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

## Handoffs
- Backend issues → Stark, log to `/logs/handoffs.md`
- Security issues → Kenobi, log to `/logs/handoffs.md`
- Architecture issues → Picard, log to `/logs/handoffs.md`
- Non-UI bugs → Batman, log to `/logs/handoffs.md`
