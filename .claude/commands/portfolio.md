# /portfolio — Steris's Cross-Project Financials

> *"Contingency plan 47-B: what if we have more than one project?"*

Read `/docs/methods/TREASURY.md` for financial operating rules.

## Prerequisites
If `wizard/server.ts` does not exist (scaffold/core users):
1. Offer: "Portfolio requires the wizard server. Pull it from upstream? [Y/n]"
2. On yes: `git fetch voidforge main 2>/dev/null || git remote add voidforge https://github.com/tmcleod3/voidforge.git && git fetch voidforge main` then `git checkout voidforge/main -- wizard/` then `cd wizard && npm install`
3. On no: stop with "Run manually: `git checkout voidforge/main -- wizard/`"

## Context Setup
1. Read `~/.voidforge/projects.json` for registered projects
2. For each project: read treasury data from `~/.voidforge/treasury/`
3. If no projects registered: "No projects registered. Run `/treasury setup` in a project directory."
4. If single project: show treasury view with note about portfolio comparisons

## Portfolio Dashboard

```
═══════════════════════════════════════════════════════
  PORTFOLIO — [Month Year]
═══════════════════════════════════════════════════════
  Projects: N active

  ┌─────────────┬──────────┬──────────┬────────┬───────┐
  │ Project     │ Revenue  │ Spend    │ Net    │ ROAS  │
  ├─────────────┼──────────┼──────────┼────────┼───────┤
  │ ...         │ $X,XXX   │ $X,XXX   │ $X,XXX │ X.Xx  │
  ├─────────────┼──────────┼──────────┼────────┼───────┤
  │ TOTAL       │ $X,XXX   │ $X,XXX   │ $X,XXX │ X.Xx  │
  └─────────────┴──────────┴──────────┴────────┴───────┘

  Budget utilization: XX% ($X,XXX / $X,XXX)
  Top performer: [project] (X.Xx ROAS)
  Underperformer: [project] (X.Xx — [note])
═══════════════════════════════════════════════════════
```

## Commands

- `/portfolio` or `/portfolio --status` — portfolio dashboard
- `/portfolio --report` — monthly report (JSON/CSV/markdown) for tax records
- `/portfolio --optimize` — Kelsier analyzes cross-project spend, recommends reallocation
- `/portfolio --add [path]` — manually register a project
- `/portfolio --remove [name]` — unregister a project

## Arguments
$ARGUMENTS
