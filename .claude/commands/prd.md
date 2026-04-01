# /prd — Sisko's PRD Generator

> Structured interview to generate a production-ready PRD with valid YAML frontmatter.

## Context Setup
1. Read `/docs/PRD.md` — understand the template structure
2. Read `/docs/methods/CAMPAIGN.md` — understand how PRDs drive campaigns

## The Interview

Sisko conducts a 5-act structured interview. Each act drafts that PRD section, shows it for confirmation, then moves to the next. The user can revise any section before moving on.

### Act 1 — "What are you building?"
Ask:
- What's the name of this project?
- Describe it in one sentence.
- Who is this for? (audience)
- What does it do? (2-3 sentences)
- What's the brand personality? (e.g., "Confident, witty, warm. Never corporate.")

**Draft:** PRD Section 1 (Product Vision). Present for confirmation.

### Act 2 — "What stack?"
Propose defaults based on Act 1, then ask:
- Framework? (Next.js, Express, Django, Rails, etc.) — Sisko proposes based on project type
- Database? (Postgres, MySQL, SQLite, MongoDB, none)
- Cache? (Redis, none)
- Styling? (Tailwind, CSS modules, styled-components, vanilla)
- Auth? (yes/no — Sisko recommends based on features)
- Payments? (Stripe, LemonSqueezy, none)
- Deploy target? (VPS, Vercel, Railway, Cloudflare, static, Docker)

**Draft:** PRD Section 3 (Tech Stack) + YAML frontmatter. Present for confirmation.

### Act 3 — "What features?"
Ask:
- What's the core user flow? (Step by step: user does X, sees Y, system does Z)
- Any supporting features? (settings, profile, notifications, search)
- Any integrations? (email, payments, file upload, third-party APIs)
- What data do you need to store? (Sisko proposes a schema based on features)

**Draft:** PRD Section 4 (Core Features) with user flows and data models. Present for confirmation.

### Act 4 — "What does it look like?"
Ask:
- Key screens? (list the main pages/views)
- Any specific UI requirements? (dark mode, mobile-first, dashboard layout)
- Route structure? (Sisko proposes based on features)

**Draft:** PRD Section 2 (System Architecture) with route structure + ASCII diagram. Present for confirmation.

### Act 5 — "How does it ship?"

**Natural Language Deploy (optional):** Before the structured questions, offer: *"Describe your ideal deployment in plain language — budget, features, scale. Or skip to configure manually."*

If the user provides a prose description (e.g., "I want a $20/month server with SSL, daily backups, and a custom domain"), run it through the natural language deploy resolver (`wizard/lib/natural-language-deploy.ts`). Present the resolved config:
- Deploy target and reasoning
- Instance type and estimated cost
- Resilience features (auto-detected from prose)
- Hostname (if mentioned)

The user confirms, adjusts, or overrides. The resolved config replaces the manual deploy target selection in Act 2's frontmatter.

**Then ask:**
- Any phased launch? (MVP first, then features?)
- Success metrics? (users, revenue, performance targets)
- Any non-functional requirements? (accessibility, performance, SEO)

**Draft:** PRD Sections 5-8 (remaining sections). Present for confirmation.

## Act 6 — Challenge (optional: `--challenge`)

If `--challenge` is passed, Boromir argues AGAINST the PRD before it's finalized:
- "This feature will be expensive to maintain because..."
- "This integration has a high chance of API deprecation..."
- "Your schema doesn't support the multi-tenant use case you mentioned..."
- "The deploy target can't handle the real-time features you described..."

The user defends their choices or adjusts the PRD. This is cheaper than discovering design flaws in Phase 9. Boromir's challenges are adversarial but constructive — he's testing the plan's strength, not rejecting it.

## Output

After all 5 (or 6) acts are confirmed:
1. Assemble the complete PRD from all confirmed sections
2. Write to `/docs/PRD.md`
3. Verify YAML frontmatter is valid and complete
4. Announce: "PRD written to /docs/PRD.md. Run `/build` to start building, or `/campaign` for autonomous execution."

## Import Mode (`--import`)

If `--import path/to/existing-PRD.md` is passed, skip the interview entirely:

1. Copy the file to `docs/PRD.md`
2. Parse and validate YAML frontmatter (same rules as `/build` Phase 0)
3. Run Troi's structural compliance check (sections present, cross-refs valid)
4. Present validation results (errors block, warnings don't)
5. If `--challenge` is also passed, run Boromir's challenge on the imported PRD
6. Announce: "PRD imported and validated. Run `/blueprint` to provision, or `/campaign` to build."

This is the lightweight alternative to `/blueprint` — it validates and places the PRD but does not provision infrastructure or discover supporting documents.

## Arguments
- No arguments → full 5-act interview
- `--challenge` → add Boromir's adversarial challenge (Act 6)
- `--import path/to/PRD.md` → skip interview, import and validate an existing PRD
- `--import path/to/PRD.md --challenge` → import + validate + challenge

## Rules
- Sisko proposes smart defaults — the user should confirm, not configure from scratch
- Each act is self-contained — the user sees and approves before moving on
- If the user is vague, Sisko asks one clarifying question (not three)
- The output PRD must have valid YAML frontmatter that `/build` Phase 0 can parse
- Never generate placeholder content — every section should have real, specific content based on the interview
