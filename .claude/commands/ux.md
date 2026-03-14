# /ux — Galadriel's UX/UI Pass

## Context Setup
1. Read `/logs/build-state.md` — understand current project state
2. Read `/docs/methods/PRODUCT_DESIGN_FRONTEND.md`

## Step 0 — Orient
Detect: framework, styling system, component library, routing, state management.
Document in phase log: "How to run", key routes, where components/styles/copy live.

## Step 1 — Product Surface Map
List every screen/route, primary user journeys, key shared components, and the state taxonomy (loading/empty/error/success/partial/unauthorized). Write to phase log.

## Step 2 — Parallel Analysis
Use the Agent tool to run these simultaneously — all are read-only analysis:
- **Agent 1 (Elrond — UX):** Review information architecture, navigation, task flows, friction points. Can users find things? Are flows intuitive?
- **Agent 2 (Arwen — Visual):** Review spacing, typography, color usage, button hierarchy, visual consistency. Does it look intentional?
- **Agent 3 (Samwise — A11y):** Check keyboard navigation, focus management, ARIA labels, color contrast, reduced motion. Test with keyboard-only navigation.

Synthesize findings from all three agents.

## Step 3 — Sequential Reviews
These require interactive testing:

**Bilbo (Copy):** Review all microcopy — labels, buttons, error messages, empty states, confirmations, destructive action warnings. Does the product speak clearly and consistently?

**Legolas (Code):** Review component architecture — semantic HTML, CSS organization, state management patterns. Reference `/docs/patterns/component.tsx`.

**Gimli (Performance):** Check loading states, skeleton screens, layout shift, optimistic UI, mobile responsiveness, touch targets (min 44px).

**Gandalf (Edge Cases):** Test forms with empty/huge/unicode inputs, broken states, dangerous actions without confirmation, validation gaps.

## Step 4 — Issue Tracker
Log all findings to `/logs/phase-10-ux-audit.md`:

| ID | Title | Severity | Category | Location | Current | Expected | Fix | Status |
|----|-------|----------|----------|----------|---------|----------|-----|--------|

Categories: UX, Visual, A11y, Copy, Performance, Edge Case

## Step 5 — Enhancement Specs (before coding)
For each fix: problem statement, proposed solution, acceptance criteria, a11y requirements (Samwise signs off), copy (Bilbo signs off).

## Step 6 — Implement (small batches)
One batch = one flow or component cluster (max ~200 lines changed). After each batch:
1. Re-run the app
2. Re-walk the affected flow
3. Test keyboard navigation
4. Update issue tracker status
5. Run `npm test` to catch regressions

## Step 7 — Harden Design System
Arwen leads. Audit shared components (buttons, inputs, cards, modals, toasts) for:
- Consistent variants (primary, secondary, danger, ghost)
- Responsive behavior
- Keyboard focus styles
- Proper ARIA attributes

## Step 7.5 — Pass 2: Re-Verify Fixes
After all fixes are applied, run a verification pass:
- **Samwise** re-audits accessibility on all modified components — verify a11y fixes didn't break other a11y properties
- **Gandalf** re-checks edge cases on fixed flows — verify fixes hold under adversarial input

If Pass 2 finds new issues, fix and re-verify until Samwise and Gandalf sign off.

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
