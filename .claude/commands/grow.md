# /grow — Kelsier's 6-Phase Growth Protocol

Read `/docs/methods/GROWTH_STRATEGIST.md` for operating rules.

## Prerequisites
If `wizard/` does not exist (scaffold/core users):
1. Offer: "The growth engine requires the wizard server. Pull it from upstream? [Y/n]"
2. On yes: `git fetch voidforge main 2>/dev/null || git remote add voidforge https://github.com/tmcleod3/voidforge.git && git fetch voidforge main` then `git checkout voidforge/main -- wizard/` then `cd wizard && npm install`
3. On no: stop with "Run manually: `git checkout voidforge/main -- wizard/`"

## Arguments
- No arguments → run/resume the 6-phase growth protocol
- `--setup` → Ad platform onboarding only (interactive credential setup for Google/Meta/LinkedIn/Twitter/Reddit). See GROWTH_STRATEGIST.md "Ad Platform Setup" section. Does NOT require a deployed product.
- `--audit-only` → Run Phase 1 (Reconnaissance) only — quick audit without building
- `--resume` → Resume from last completed phase in growth-state.md
- `--plan` → Planning mode: analyze and recommend without executing. Present findings and proposed changes for review.

## `/grow --setup` (Ad Platform Onboarding)

If `--setup` is specified, skip the 6-phase protocol and run the ad platform onboarding flow:
1. Check: is Cultivation installed? (`~/.voidforge/treasury/vault.enc` exists). If not: "Run `/cultivation install` first."
2. Read GROWTH_STRATEGIST.md "Ad Platform Setup" section
3. Present platform options with best-fit guidance per product type
4. For each selected platform: account check → credential collection → test connection → store in vault
5. Summary: which platforms are connected, suggest next steps (`/grow` to start campaigns)

## Context Setup
1. Read `/logs/growth-state.md` — if it exists, resume from current phase
2. Read `/logs/growth-brief.md` — if it exists, reconnaissance is complete
3. Read the PRD — extract product vision, target audience, deployed URL
4. Verify the product is deployed: check for a live URL in deploy logs or PRD. If not deployed and not `--setup`: "Can't grow what doesn't exist. Run `/campaign` first."

## First-Run Experience

If no `growth-brief.md` exists (first time running /grow):
1. Display overview: "The growth pipeline has 6 phases: Reconnaissance → Foundation → Content → Distribution → Compliance → Measure."
2. Ask: "Guided walkthrough with explanations, or expert mode? [guided/expert]"
3. In guided mode, each phase transition shows a 2-sentence explanation and estimated time.
4. Display estimated total: "Full pipeline: ~30-60 minutes. Audit only (--audit-only): ~10 minutes."

## Phase Execution

### Phase 1 — Reconnaissance (Kelsier + Vin + Marsh)
1. Kelsier reads PRD, scans deployed site, produces Growth Brief
2. Vin audits analytics (GA4, Plausible, PostHog)
3. Marsh scans 3-5 competitors
4. Output: `/logs/growth-brief.md`
5. **Gate:** User confirmation before Phase 2

### Phase 2 — Foundation (Navani + Raoden)
1. Navani: Core Web Vitals, meta tags, structured data, sitemap, robots.txt
2. Vin: Analytics snippet, event tracking, UTM strategy
3. Raoden: Conversion audit — CTAs, forms, page speed, social proof
4. Preview code changes before applying: "[Y]es / [n]o / [d]iff"
5. Commit changes as separate git commit
6. Output: `/logs/growth-foundation.md`
7. Auto-continues to Phase 3

### Phase 3 — Content (Shallan + Hoid)
1. Shallan: Blog topics, changelog format, social calendar, visual check
2. Hoid: Landing page copy, feature descriptions, CTAs, error messages
3. Blog drafts to `/content/blog/`. Copy changes committed.
4. Output: `/logs/growth-content.md`
5. **Gate:** User confirmation before Phase 4

### Phase 4 — Distribution (3 parallel tracks)
**Track A — Organic** (Kaladin + Lift + Adolin): Community posts, social content, launch plan
**Track B — Paid** (Wax + Wayne + Steris): Campaign architecture, creative variants, budget allocation
**Track C — Outreach** (Sarene): Cold email sequences, co-marketing pitches

Output: `/logs/growth-distribution.md` + `/logs/growth-campaigns.json`

If treasury is set up: "Campaigns ready. Launch now? [Y/n/later]"
- Y → send `launchCampaigns` to daemon socket
- later → "Launch with `voidforge treasury --launch` when ready"
If treasury NOT set up: "Run `/treasury setup` first, then `voidforge treasury --launch`"

### Phase 5 — Compliance (Szeth)
1. Privacy (cookie consent, privacy policy, DPA)
2. Email (CAN-SPAM, GDPR opt-in, unsubscribe)
3. Ad platform ToS (per-platform creative review)
4. Financial (spend tracking, revenue classification)
5. **Szeth blocks campaign launch on Critical compliance issues**
6. Output: `/logs/growth-compliance.md`
7. Auto-continues to Phase 6

### Phase 6 — Measure & Iterate (Vin + Kelsier)
1. Vin establishes measurement baseline
2. Kelsier defines decision rules for autonomous monitoring
3. CLI-to-autonomous handoff — show transition screen per §9.19.8
4. Daemon takes over with Tier 1 deterministic rules

## Phase Transitions

User confirmation required between: Phase 1→2, Phase 3→4, Phase 5→6.
Phases 2→3 and 4→5 auto-continue.
On "no" at any gate: save state to `growth-state.md`, exit with "Resume with `/grow --phase N`"

## Flags

- `--phase N` → resume from phase N (checks previous phase output)
- `--audit-only` → Phases 1-2 only
- `--seo` → Phase 2 only (Navani + Raoden)
- `--content` → Phase 3 only (Shallan + Hoid)
- `--distribute` → Phase 4 only (assumes 1-3 done)
- `--budget N` → set total monthly budget for Phase 4
- `--explain` → show daemon rules and thresholds
- `--dry-run` → Show what Phase 4 (Distribution) would create without submitting to platforms.

## Arguments
$ARGUMENTS
