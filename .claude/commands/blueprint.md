# /blueprint — The Blueprint Path

> You've done the thinking. The forge does the building.

Accept a pre-written PRD and supporting documents, validate them, provision infrastructure, and prepare for campaign execution. The fourth entry path — for users who already have a complete spec from Claude chat, a consultant, a previous iteration, or another tool.

## Context Setup
1. Read `/docs/methods/BUILD_PROTOCOL.md` (Phase 0 — Orient)
2. Read `/docs/methods/SYSTEMS_ARCHITECT.md` (Conflict Checklist)

## Prerequisites
- `docs/PRD.md` MUST exist with valid YAML frontmatter
- VoidForge methodology CLAUDE.md must be present at project root

## Step 1 — Picard Validates the PRD

Read `docs/PRD.md` and validate:

1. **Parse YAML frontmatter** using the frontmatter parser
   - Required fields: `name` (any other fields are optional but recognized)
   - Type-check: `type` must be one of: full-stack, api-only, static-site, prototype
   - Deploy-check: `deploy` must be one of: vps, vercel, railway, cloudflare, static, docker
   - If validation fails → show specific errors with guidance on how to fix

2. **Troi's structural compliance** (from `prd-validator.ts`):
   - Does the PRD have an OVERVIEW or SUMMARY section?
   - Are there feature sections?
   - If `database` is configured, is there a DATA MODELS section?
   - If `deploy` is set, is there a DEPLOYMENT section?
   - If `auth: yes`, does the PRD mention authentication?
   - If `workers: yes`, does the PRD mention background jobs?
   - These are warnings, not blockers. Present them and proceed.

3. **Extract architecture** from frontmatter:
   - Framework, database, auth strategy, deploy target, workers
   - Show: "Blueprint: [name] — [framework] + [language], deploy to [target]"

## Step 2 — Wong Discovers Supporting Documents

Scan the project directory for supporting materials:

| File | Action |
|------|--------|
| `docs/PRD.md` | **Required.** Already validated in Step 1. |
| `docs/PROJECT-DIRECTIVES.md` (or `docs/PROJECT-CLAUDE.md`, `docs/DIRECTIVES.md`) | **Appended** to CLAUDE.md methodology. Never replaces. |
| `docs/OPERATIONS.md` | Loaded into context. Sisko references during campaign planning. |
| `docs/ADR/*.md` (or `docs/adrs/*.md`) | Loaded into context. Picard references during architecture review. |
| `docs/reference/*` | Loaded into context. Available to all agents during build. |

Present discovery summary: "Wong found N supporting documents: [list]"

## Step 3 — Merge Project Directives

If a project directives file was discovered:
1. Read its contents
2. Append to CLAUDE.md under a `# PROJECT-SPECIFIC DIRECTIVES` marker
3. This is idempotent — if the marker already exists, skip
4. **CRITICAL: The merge APPENDS. It never replaces VoidForge's methodology.**

Log: "Project directives merged into CLAUDE.md from [path]"

## Step 4 — Picard's Conflict Scan

Run the conflict checklist against frontmatter:
- Auth + Database: auth needs persistent storage
- Payments + Auth: payments need authenticated users
- Workers + Deploy: workers need persistent hosting (not static/cloudflare)
- Cache + Deploy: Redis needs a host
- Admin + Auth: admin panel needs authentication
- Email + Credentials: email needs API keys

Present conflicts as warnings. User can fix (edit PRD) or proceed.

## Step 5 — Boromir's Challenge (if `--challenge`)

If the `--challenge` flag is passed:
1. Boromir reads the complete PRD
2. Argues AGAINST it: expensive features, fragile integrations, schema gaps, deploy target mismatches
3. User can accept challenges (edit PRD) or override (proceed as-is)
4. This is cheaper than discovering design flaws in Phase 9

## Step 6 — Kusanagi Provisions Infrastructure (unless `--no-provision`)

If provisioning is requested (default):
1. Use the existing wizard provisioning pipeline
2. Configure from PRD frontmatter: framework, database, deploy target, workers
3. Install dependencies, set up tsconfig/package.json
4. Configure deploy target (EC2, Vercel, Railway, Cloudflare, Docker)
5. Set up PM2 if workers are defined
6. Set up Docker Compose if containerized services specified
7. DNS + SSL if domain specified

Skip this step if `--no-provision` flag is set.

## Step 7 — Hand Off to Campaign

All prerequisites are met:
- PRD validated
- Supporting docs loaded
- CLAUDE.md merged (if directives exist)
- Conflicts scanned
- Infrastructure provisioned (unless --no-provision)

Present summary:
```
═══════════════════════════════════════════
  BLUEPRINT VALIDATED
═══════════════════════════════════════════
  Project:     [name]
  Stack:       [framework] + [language]
  Deploy:      [target]
  Docs loaded: [N] supporting documents
  Conflicts:   [N] warnings (non-blocking)
  Provision:   [done / skipped]
═══════════════════════════════════════════
  Ready to build. Run:
    /campaign --blitz          # Autonomous build
    /campaign --blitz --muster # Full multi-agent review
═══════════════════════════════════════════
```

## Arguments
- `--challenge` — Boromir argues against the PRD before provisioning
- `--no-provision` — Skip infrastructure provisioning (validate + discover only)
- No arguments — full pipeline: validate → discover → merge → conflict-scan → provision

## Agents

| Agent | Role |
|-------|------|
| **Picard** | Validates frontmatter + runs conflict scan |
| **Troi** | Structural PRD compliance check |
| **Wong** | Discovers and loads supporting documents |
| **Boromir** | Challenges PRD design (with --challenge) |
| **Kusanagi** | Provisions infrastructure from frontmatter |
