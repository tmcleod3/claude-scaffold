# v11.0 Architecture Plan — The Consciousness

> This file captures the full context for a fresh session to run the Predictive Infinity Gauntlet + UX deep dive against the v11 roadmap.

## What Happened This Session

- **Campaign 4 (v10.1):** 4 missions, Victory Gauntlet passed 4/4. War Room data feeds, confidence scoring, agent debates, Living PRD enforcement.
- **Campaign 5 (v10.2):** 3 missions, Victory Gauntlet passed 3/3. Natural Language Deploy, Methodology A/B Testing, Prophecy Visualizer.
- **Inbox triage:** 22 field reports processed (18 closed, 4 fixed with 15 methodology improvements).
- **Roadmap proposal #96:** v11.0 Cosmere universe accepted and integrated into ROADMAP.md.
- **Current version:** v10.2.0

## What the Next Session Should Do

### Step 1: Expand v11 Roadmap into Full PRD

Run `/campaign --plan` to transform the ROADMAP.md v11 section into a full PRD-quality specification. The current roadmap is a sketch — it needs:

- Full user flows for `/grow` (who runs it, what they see, what happens at each phase)
- Full user flows for `/treasury` (how revenue connects, how budgets are set, what the dashboard shows)
- Schema design for financial data (transactions, budgets, campaigns, spend records)
- Integration specifications for each ad platform (API versions, auth flows, webhook formats)
- War Room panel designs for growth data (ROAS charts, funnel visualization, spend tracking)
- The persistent server architecture (daemon mode, scheduled jobs, health monitoring)

### Step 2: UX Deep Dive (Galadriel's Full Team)

Launch the complete Tolkien UX roster against the v11 design:

- **Galadriel** — overall product vision: how does the CLI→dashboard transition feel?
- **Elrond** — information architecture: how are growth, treasury, portfolio organized?
- **Arwen** — visual design: what do ROAS charts, funnel visualizations, spend graphs look like?
- **Samwise** — accessibility: can all financial dashboards be keyboard-navigated?
- **Bilbo** — copy: what language does VoidForge use for money? (balances, spend, revenue)
- **Celeborn** — design system: do growth panels use the same tokens as War Room panels?
- **Éowyn** — enchantment: where can the growth dashboard surprise and delight?
- **Legolas** — code architecture: component structure for financial UI
- **Gimli** — performance: real-time ad spend tracking without killing the browser
- **Radagast** — edge cases: what happens when the bank API returns unexpected data?
- **Aragorn** — prioritization: which UX decisions matter most for launch?
- **Pippin** — chaos: resize mid-transaction, switch tabs during payment, back button during deploy

### Step 3: Predictive Infinity Gauntlet

Run `/gauntlet --infinity` but reframed for design review (not code review). Every agent examines the v11 ROADMAP and PRD specification:

**Round 1 — Discovery (5 leads scan the design):**
- Picard: Architecture — can this monolith handle financial operations? Database needs? Service boundaries?
- Stark: Code implications — what new modules, APIs, patterns does this require?
- Galadriel: UX surface — how many new screens, dashboards, flows?
- Kenobi: Security — financial credentials, PCI compliance, ad API key protection
- Kusanagi: Infrastructure — persistent daemon, cron jobs, EC2 deployment, monitoring

**Round 2 — First Strike (full domain audits on the design):**
- Batman (QA): What breaks? Ad API rate limits, budget race conditions, reconciliation failures
- Galadriel (UX): Full usability walkthrough of every growth flow
- Kenobi (Security): Threat model for financial operations — attack vectors, credential storage, spend authorization
- Stark (Integration): Trace every external API call — what happens on failure?

**Round 3 — Second Strike (targeted probing):**
- Re-verify all Round 2 findings
- Test the safety tier design: can the $500/day hard stop be bypassed?
- Test the heartbeat mode: what if the daemon crashes mid-campaign?

**Round 4 — Crossfire (adversarial):**
- Maul: How would you steal money from a VoidForge Treasury?
- Deathstroke: How would you bypass spend limits?
- Loki: What chaos happens when 3 ad platforms return errors simultaneously?
- Constantine: What in this design works by accident?

**Round 5 — Council (convergence):**
- Spock: Does the design hold together architecturally?
- Ahsoka: Are there access control gaps in the financial model?
- Troi: Does the implementation plan match the product vision?
- Padmé: Can a real user actually use this?

**Pass 2 (Rounds 6-10): Same structure, re-probing all findings.**

## Critical Architecture Questions to Resolve

### 1. The Daemon Problem
VoidForge today is ephemeral — starts when you run a command, stops when it's done. v11 needs:
- **Heartbeat mode:** Always-on process that checks ad campaigns, reconciles spend, monitors metrics
- **Scheduled jobs:** Daily budget resets, weekly ROAS reports, monthly reconciliation
- **Where it runs:** EC2 instance? Docker container? The user's machine with launchd/systemd?
- **What happens when it crashes:** Spend continues on ad platforms — VoidForge can't pause Meta ads if VoidForge is down

**Picard's initial take:** The daemon should be a separate process from the wizard server. `voidforge heartbeat start` launches it. It writes to `~/.voidforge/heartbeat.json`. The War Room polls this file. If the heartbeat stops, the War Room shows a warning. Ad platform campaigns continue (by design — you don't want a VoidForge crash to pause your ads). But spend monitoring stops, so alerts stop.

### 2. The Money Problem
VoidForge has never handled real money. The jump from "deploy to AWS" to "spend $50/day on Meta Ads" is not incremental — it's a category change.

- **Bank API credentials** are more sensitive than cloud credentials. Compromise means financial loss, not just infrastructure damage.
- **Ad platform OAuth** tokens can spend money. Storing them in the vault is necessary but the vault password becomes a financial security control.
- **Reconciliation** must be bulletproof. If VoidForge says you spent $200 but Meta says $250, who's right?
- **Multi-currency** if the user's products are international
- **Tax implications** — VoidForge tracks spend, but should it track revenue for tax reporting?

**Kenobi's initial take:** Separate financial vault from infrastructure vault. Two-key architecture: vault password + TOTP for any financial operation. Daily spend reconciliation against platform reports. Immutable append-only spend log that never gets rewritten (unlike experiments.json which we just made atomic-write).

### 3. The UX Paradigm Shift
Today: CLI → terminal output → done.
v11: CLI → persistent dashboard → growth data → financial data → ongoing monitoring.

- **The War Room becomes primary.** Growth charts, spend tracking, ROAS visualization, funnel analysis — these are visual, not text.
- **The CLI becomes the control plane.** `/grow --budget 50` sets the budget. The War Room shows the result.
- **Mobile access matters.** If your ads are running 24/7, you need to check spend from your phone. Avengers Tower Remote (v6.5) supports this, but the financial UX needs to be mobile-optimized.

**Galadriel's initial take:** The growth dashboard should be a new War Room tab (like the existing Prophecy Graph). Not a separate UI. Same design system, same dark theme, same panel structure. Financial data gets the same treatment as build data — panels with real-time numbers.

### 4. The Integration Surface
v10 has ~0 external API integrations (everything reads local files).
v11 proposes:

| Integration | Auth Type | Rate Limits | Webhook? | Spend? |
|-------------|-----------|-------------|----------|--------|
| Meta Marketing API | OAuth 2.0 | 200/hr/ad account | Yes | Yes |
| Google Ads API | OAuth 2.0 | 15,000/day | No | Yes |
| TikTok Marketing API | OAuth 2.0 | 10/sec | Yes | Yes |
| LinkedIn Marketing API | OAuth 2.0 | 100/day | No | Yes |
| Twitter/X Ads API | OAuth 1.0a | 450/15min | No | Yes |
| Reddit Ads API | OAuth 2.0 | Unknown | No | Yes |
| Stripe | API Key | 100/sec | Yes | No (revenue in) |
| Mercury/Brex | OAuth 2.0 | Varies | Yes | No (bank data) |
| Google Analytics | OAuth 2.0 | 10,000/day | No | No |

That's 9+ OAuth flows, each with its own token refresh cycle, error format, and rate limit strategy. This is more integration surface than the rest of VoidForge combined.

### 5. The Compliance Problem
Szeth's domain is real:
- **GDPR:** If growth campaigns target EU users, cookie consent, data processing agreements
- **CAN-SPAM:** Email outreach (Sarene) must comply — unsubscribe, physical address, no deception
- **Ad platform ToS:** Each platform has creative requirements, prohibited content, account suspension risks
- **PCI DSS:** If Treasury handles card data directly (it shouldn't — use Stripe as the processor)
- **Financial reporting:** Spend tracking for tax deductions, revenue tracking for income reporting

## Files to Read in Next Session

1. **ROADMAP.md** — v11.0-v11.3 section (full current plan)
2. **PRD-VOIDFORGE.md** — current PRD (needs v11 expansion)
3. **This file** (`logs/v11-architecture-plan.md`) — full context from this session
4. **docs/methods/GAUNTLET.md** — the Infinity Gauntlet protocol (reframe for design review)
5. **wizard/server.ts** — current server architecture (baseline for daemon evolution)
6. **wizard/lib/provisioners/types.ts** — current integration patterns (baseline for ad platform adapters)

## Expected Output from Next Session

1. **v11 PRD expansion** — full user flows, schemas, integration specs
2. **UX review findings** — from Galadriel's full team (12+ agents)
3. **Infinity Gauntlet findings** — 10 rounds of design-level review (~80 agent perspectives)
4. **Architecture decisions** — ADRs for daemon mode, financial vault, integration layer, compliance
5. **Revised roadmap** — v11 section updated with findings, potentially re-scoped

## Command to Run

```
/campaign --plan expand v11.0-v11.3 into full PRD specification, then run /gauntlet --infinity against the design
```

Or manually:
1. `/prd` — expand the v11 features into a full PRD section
2. `/architect` — full architecture review with all agents
3. `/gauntlet --infinity` — 10-round design review with ~80 agents
4. `/ux` — Galadriel's full team on the growth dashboard UX
